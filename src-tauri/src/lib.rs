use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Debug, Serialize)]
struct CommandOutput {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    success: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct LocalChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    #[serde(default)]
    data: Vec<OpenAiModel>,
    #[serde(default)]
    models: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    #[serde(alias = "name", alias = "model")]
    id: String,
}

#[derive(Debug, Serialize)]
struct OpenAiChatRequest<'a> {
    model: &'a str,
    messages: &'a [LocalChatMessage],
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChatChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatChoice {
    message: OpenAiChatResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponseMessage {
    content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicChatRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicChatMessage>,
}

#[derive(Debug, Serialize)]
struct AnthropicChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicChatResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    text: Option<String>,
}

fn validate_local_api_base_url(base_url: &str) -> Result<reqwest::Url, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() || trimmed.len() > 2_048 {
        return Err("יש להזין כתובת API מקומית תקינה.".into());
    }
    let mut url =
        reqwest::Url::parse(trimmed).map_err(|_| "כתובת ה־API אינה תקינה.".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("יש להשתמש בכתובת HTTP(S) מקומית ללא פרטי משתמש, שאילתה או מקטע.".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "כתובת ה־API חייבת לכלול מארח מקומי.".to_string())?;
    let normalized_host = host.trim_start_matches('[').trim_end_matches(']');
    let is_loopback = normalized_host.eq_ignore_ascii_case("localhost")
        || normalized_host
            .parse::<std::net::IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false);
    if !is_loopback {
        return Err("מטעמי פרטיות, החיבור מוגבל ל־localhost ולכתובות loopback בלבד.".into());
    }
    let path = url.path().trim_end_matches('/').to_string();
    url.set_path(&format!("{path}/"));
    Ok(url)
}

fn validate_local_api_key(api_key: &str) -> Result<(), String> {
    if api_key.len() > 2_048 {
        return Err("מפתח הגישה ארוך מדי.".into());
    }
    Ok(())
}

fn validate_local_api_protocol(protocol: &str) -> Result<(), String> {
    if ["openai", "anthropic"].contains(&protocol) {
        Ok(())
    } else {
        Err("פרוטוקול API מקומי לא נתמך.".into())
    }
}

fn local_api_endpoint(base: &reqwest::Url, path: &str) -> Result<reqwest::Url, String> {
    let base_path = base.path().trim_end_matches('/');
    let relative = if base_path.ends_with("/v1") {
        path.trim_start_matches('/').to_string()
    } else {
        format!("v1/{}", path.trim_start_matches('/'))
    };
    base.join(&relative)
        .map_err(|error| format!("כתובת נקודת הקצה אינה תקינה: {}", error))
}

fn validate_local_chat_request(model: &str, messages: &[LocalChatMessage]) -> Result<(), String> {
    if model.trim().is_empty() || model.len() > 160 {
        return Err("יש לבחור מודל מקומי תקין.".into());
    }
    if messages.is_empty() || messages.len() > 32 {
        return Err("השיחה חייבת להכיל בין הודעה אחת ל־32 הודעות.".into());
    }

    let mut total_bytes = 0usize;
    for message in messages {
        if !["system", "user", "assistant"].contains(&message.role.as_str()) {
            return Err("תפקיד הודעה לא תקין.".into());
        }
        if message.content.len() > 40_000 {
            return Err("הודעה בודדת ארוכה מדי.".into());
        }
        total_bytes += message.content.len();
    }
    if total_bytes > 100_000 {
        return Err("ההקשר המצטבר ארוך מדי לבקשה אחת.".into());
    }
    Ok(())
}

#[derive(Debug, Serialize)]
struct SearchResult {
    path: String,
    line_number: usize,
    preview: String,
}

fn append_search_matches(path: &Path, content: &str, query: &str, results: &mut Vec<SearchResult>) {
    for (index, line) in content.lines().enumerate() {
        if line.to_lowercase().contains(query) {
            results.push(SearchResult {
                path: path.to_string_lossy().to_string(),
                line_number: index + 1,
                preview: line.chars().take(240).collect(),
            });
            if results.len() >= 500 {
                return;
            }
        }
    }
}

fn search_directory(
    directory: &Path,
    query: &str,
    results: &mut Vec<SearchResult>,
    files_scanned: &mut usize,
    depth: usize,
) {
    const MAX_DEPTH: usize = 24;
    const MAX_FILES: usize = 20_000;
    const MAX_FILE_BYTES: u64 = 1_048_576;
    const SKIP_DIRECTORIES: [&str; 10] = [
        ".git",
        ".idea",
        ".next",
        ".venv",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "target",
        "venv",
    ];

    if depth > MAX_DEPTH || results.len() >= 500 || *files_scanned >= MAX_FILES {
        return;
    }

    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= 500 || *files_scanned >= MAX_FILES {
            break;
        }

        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if SKIP_DIRECTORIES.contains(&name.as_str()) {
                continue;
            }
            search_directory(&path, query, results, files_scanned, depth + 1);
        } else if file_type.is_file() {
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.len() > MAX_FILE_BYTES {
                continue;
            }

            *files_scanned += 1;
            if let Ok(content) = fs::read_to_string(&path) {
                append_search_matches(&path, &content, query, results);
            }
        }
    }
}

#[tauri::command]
async fn search_workspace(directory: String, query: String) -> Result<Vec<SearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Err("יש להזין טקסט לחיפוש.".into());
    }

    let root = PathBuf::from(directory);
    if !root.is_dir() {
        return Err("תיקיית העבודה אינה קיימת.".into());
    }

    let task = tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        let mut files_scanned = 0;
        search_directory(&root, &query, &mut results, &mut files_scanned, 0);
        results.sort_by(|a, b| {
            a.path
                .cmp(&b.path)
                .then_with(|| a.line_number.cmp(&b.line_number))
        });
        Ok(results)
    });

    task.await
        .map_err(|error| format!("משימת החיפוש נכשלה: {}", error))?
}

fn limit_command_output(mut value: String) -> String {
    const MAX_BYTES: usize = 128 * 1024;
    if value.len() > MAX_BYTES {
        let mut boundary = MAX_BYTES;
        while !value.is_char_boundary(boundary) {
            boundary -= 1;
        }
        value.truncate(boundary);
        value.push_str("\n\n[הפלט נחתך לאחר 128 KB]");
    }
    value
}

#[tauri::command]
async fn run_workspace_command(
    directory: String,
    command: String,
) -> Result<CommandOutput, String> {
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("יש להזין פקודה להרצה.".into());
    }
    let working_directory = PathBuf::from(directory);
    if !working_directory.is_dir() {
        return Err("תיקיית העבודה אינה קיימת.".into());
    }

    let task = tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        let output = Command::new("cmd.exe")
            .args(["/C", command.as_str()])
            .current_dir(&working_directory)
            .output();

        #[cfg(not(target_os = "windows"))]
        let output = Command::new("sh")
            .args(["-lc", command.as_str()])
            .current_dir(&working_directory)
            .output();

        let output = output.map_err(|error| format!("הפעלת הפקודה נכשלה: {}", error))?;
        Ok(CommandOutput {
            stdout: limit_command_output(String::from_utf8_lossy(&output.stdout).into_owned()),
            stderr: limit_command_output(String::from_utf8_lossy(&output.stderr).into_owned()),
            exit_code: output.status.code(),
            success: output.status.success(),
        })
    });

    task.await
        .map_err(|error| format!("משימת הפקודה נכשלה: {}", error))?
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("{}: {}", path, error))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|error| format!("{}: {}", path, error))
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|error| format!("{}: {}", path, error))?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        result.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            // Do not follow directory symlinks: a workspace can contain cycles.
            is_dir: file_type.is_dir(),
        });
    }
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|error| format!("{}: {}", path, error))
}

fn validate_child_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.trim() != name
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err("שם לא תקין. יש להזין שם קובץ או תיקייה ללא נתיב או תווים אסורים.".into());
    }
    Ok(())
}

#[tauri::command]
fn create_file_in_directory(parent: String, name: String) -> Result<String, String> {
    validate_child_name(&name)?;
    let parent = PathBuf::from(parent);
    if !parent.is_dir() {
        return Err(format!("תיקיית היעד אינה קיימת: {}", parent.display()));
    }
    let path = parent.join(name);
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("יצירת הקובץ נכשלה: {}: {}", path.display(), error))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_directory_in_directory(parent: String, name: String) -> Result<String, String> {
    validate_child_name(&name)?;
    let parent = PathBuf::from(parent);
    if !parent.is_dir() {
        return Err(format!("תיקיית היעד אינה קיימת: {}", parent.display()));
    }
    let path = parent.join(name);
    fs::create_dir(&path)
        .map_err(|error| format!("יצירת התיקייה נכשלה: {}: {}", path.display(), error))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_path(path: String, name: String) -> Result<String, String> {
    validate_child_name(&name)?;
    let source = PathBuf::from(path);
    if !source.exists() {
        return Err(format!("הנתיב אינו קיים: {}", source.display()));
    }
    let parent = source
        .parent()
        .ok_or_else(|| "לא ניתן לשנות את שם תיקיית הבסיס.".to_string())?;
    let destination = parent.join(name);
    if destination.exists() {
        return Err(format!("כבר קיים פריט בשם: {}", destination.display()));
    }
    fs::rename(&source, &destination).map_err(|error| format!("שינוי השם נכשל: {}", error))?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let metadata = fs::symlink_metadata(&target)
        .map_err(|error| format!("לא ניתן לקרוא את הפריט: {}", error))?;
    if metadata.file_type().is_dir() {
        fs::remove_dir(&target)
            .map_err(|error| format!("מחיקת התיקייה נכשלה (אפשר למחוק רק תיקייה ריקה): {}", error))
    } else {
        fs::remove_file(&target).map_err(|error| format!("מחיקת הקובץ נכשלה: {}", error))
    }
}

#[tauri::command]
async fn list_local_models(
    base_url: String,
    api_key: Option<String>,
    protocol: String,
) -> Result<Vec<String>, String> {
    validate_local_api_protocol(&protocol)?;
    let base = validate_local_api_base_url(&base_url)?;
    let api_key = api_key.unwrap_or_default();
    validate_local_api_key(&api_key)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("יצירת חיבור מקומי נכשלה: {}", error))?;
    let mut request = client.get(local_api_endpoint(&base, "models")?);
    if !api_key.trim().is_empty() {
        request = request.bearer_auth(api_key.trim());
        if protocol == "anthropic" {
            request = request.header("x-api-key", api_key.trim());
        }
    }
    let response = request.send().await.map_err(|_| {
        "לא ניתן להתחבר לשרת המקומי. בדקו שהוא פועל ושהכתובת כוללת את נתיב ה־API הנכון.".to_string()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "שרת המודלים החזיר שגיאת HTTP: {}",
            response.status()
        ));
    }
    let payload = response
        .json::<OpenAiModelsResponse>()
        .await
        .map_err(|error| format!("תשובת רשימת המודלים אינה תואמת OpenAI API: {}", error))?;
    let mut models = payload
        .data
        .into_iter()
        .chain(payload.models)
        .map(|model| model.id)
        .filter(|model| !model.trim().is_empty())
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
async fn chat_local_model(
    base_url: String,
    api_key: Option<String>,
    protocol: String,
    model: String,
    messages: Vec<LocalChatMessage>,
) -> Result<String, String> {
    validate_local_chat_request(&model, &messages)?;
    validate_local_api_protocol(&protocol)?;
    let base = validate_local_api_base_url(&base_url)?;
    let api_key = api_key.unwrap_or_default();
    validate_local_api_key(&api_key)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("יצירת חיבור מקומי נכשלה: {}", error))?;

    if protocol == "openai" {
        let request = OpenAiChatRequest {
            model: &model,
            messages: &messages,
            stream: false,
        };
        let mut outgoing = client
            .post(local_api_endpoint(&base, "chat/completions")?)
            .json(&request);
        if !api_key.trim().is_empty() {
            outgoing = outgoing.bearer_auth(api_key.trim());
        }
        let response = outgoing.send().await.map_err(|_| {
            "הבקשה לשרת המודל המקומי נכשלה. בדקו שהשרת פועל ושהכתובת נכונה.".to_string()
        })?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let detail = body.chars().take(240).collect::<String>();
            return Err(format!("שרת המודל החזיר HTTP {}: {}", status, detail));
        }
        let response = response
            .json::<OpenAiChatResponse>()
            .await
            .map_err(|error| {
                format!("תשובת המודל אינה תואמת OpenAI Chat Completions: {}", error)
            })?;
        return response
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .ok_or_else(|| "שרת המודל החזיר תשובה ללא בחירה (choices).".into());
    }

    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let conversation = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| AnthropicChatMessage {
            role: message.role.clone(),
            content: message.content.clone(),
        })
        .collect::<Vec<_>>();
    if conversation.is_empty() {
        return Err("נדרשת לפחות הודעת משתמש אחת לשיחת Anthropic.".into());
    }
    let request = AnthropicChatRequest {
        model,
        max_tokens: 4_096,
        system: if system.is_empty() {
            None
        } else {
            Some(system)
        },
        messages: conversation,
    };
    let mut outgoing = client
        .post(local_api_endpoint(&base, "messages")?)
        .header("anthropic-version", "2023-06-01")
        .json(&request);
    if !api_key.trim().is_empty() {
        outgoing = outgoing.header("x-api-key", api_key.trim());
    }
    let response = outgoing.send().await.map_err(|_| {
        "הבקשה לשרת Anthropic המקומי נכשלה. בדקו שהשרת פועל ושהכתובת נכונה.".to_string()
    })?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.chars().take(240).collect::<String>();
        return Err(format!("שרת Anthropic החזיר HTTP {}: {}", status, detail));
    }
    let response = response
        .json::<AnthropicChatResponse>()
        .await
        .map_err(|error| format!("תשובת המודל אינה תואמת Anthropic Messages API: {}", error))?;
    let answer = response
        .content
        .into_iter()
        .filter_map(|block| block.text)
        .collect::<Vec<_>>()
        .join("\n");
    if answer.is_empty() {
        return Err("שרת Anthropic החזיר תשובה ללא תוכן טקסטואלי.".into());
    }
    Ok(answer)
}

#[tauri::command]
fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_directory,
            create_directory,
            create_file_in_directory,
            create_directory_in_directory,
            rename_path,
            delete_path,
            run_workspace_command,
            search_workspace,
            list_local_models,
            chat_local_model,
            get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Editor Offline");
}

#[cfg(test)]
mod tests {
    use super::{
        append_search_matches, create_directory_in_directory, create_file_in_directory,
        delete_path, limit_command_output, local_api_endpoint, rename_path, search_directory,
        validate_child_name, validate_local_api_base_url, validate_local_api_protocol,
        validate_local_chat_request, LocalChatMessage,
    };
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "editor-offline-test-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir(&path).expect("temporary directory should be created");
        path
    }

    #[test]
    fn accepts_simple_file_and_folder_names() {
        assert!(validate_child_name("main.rs").is_ok());
        assert!(validate_child_name("src").is_ok());
        assert!(validate_child_name("קובץ חדש.txt").is_ok());
    }

    #[test]
    fn rejects_empty_or_traversal_names() {
        for name in ["", ".", "..", "../escape", "nested/file", "nested\\file"] {
            assert!(
                validate_child_name(name).is_err(),
                "accepted unsafe name: {name}"
            );
        }
    }

    #[test]
    fn rejects_windows_reserved_path_characters() {
        for name in [
            "bad:name",
            "bad|name",
            "bad?name",
            "bad*name",
            " trailing",
            "trailing ",
        ] {
            assert!(
                validate_child_name(name).is_err(),
                "accepted invalid name: {name}"
            );
        }
    }

    #[test]
    fn workspace_files_can_be_created_renamed_and_deleted() {
        let root = temporary_directory();
        let root_string = root.to_string_lossy().into_owned();

        let original = create_file_in_directory(root_string.clone(), "first.txt".into())
            .expect("file should be created");
        assert!(Path::new(&original).is_file());
        assert!(create_file_in_directory(root_string.clone(), "first.txt".into()).is_err());

        let renamed =
            rename_path(original.clone(), "renamed.txt".into()).expect("file should be renamed");
        assert!(!Path::new(&original).exists());
        assert!(Path::new(&renamed).is_file());

        delete_path(renamed.clone()).expect("file should be deleted");
        assert!(!Path::new(&renamed).exists());
        std::fs::remove_dir(&root).expect("temporary directory should be removed");
    }

    #[test]
    fn non_empty_directories_cannot_be_deleted() {
        let root = temporary_directory();
        let root_string = root.to_string_lossy().into_owned();
        let nested = create_directory_in_directory(root_string, "nested".into())
            .expect("nested directory should be created");
        let file = create_file_in_directory(nested.clone(), "keep.txt".into())
            .expect("nested file should be created");

        assert!(delete_path(nested.clone()).is_err());
        assert!(Path::new(&file).exists());
        delete_path(file).expect("nested file should be deleted");
        delete_path(nested).expect("empty nested directory should be deleted");
        std::fs::remove_dir(&root).expect("temporary directory should be removed");
    }

    #[test]
    fn command_output_is_bounded_without_breaking_utf8() {
        let output = limit_command_output("א".repeat(70_000));
        assert!(output.contains("[הפלט נחתך לאחר 128 KB]"));
        assert!(output.is_char_boundary(output.len()));
    }

    #[test]
    fn project_search_is_case_insensitive_and_uses_one_based_lines() {
        let mut results = Vec::new();
        append_search_matches(
            Path::new("src/main.rs"),
            "fn main() {\n    let Value = 1;\n    println!(\"done\");\n}",
            "value",
            &mut results,
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 2);
        assert!(results[0].preview.contains("Value"));
    }

    #[test]
    fn project_search_walks_source_and_skips_dependency_directories() {
        let root = temporary_directory();
        let source = root.join("src");
        let dependencies = root.join("node_modules");
        std::fs::create_dir(&source).expect("source directory should be created");
        std::fs::create_dir(&dependencies).expect("dependency directory should be created");
        std::fs::write(source.join("main.rs"), "first line\nneedle here\nlast line")
            .expect("source file should be written");
        std::fs::write(dependencies.join("ignored.js"), "needle in dependency")
            .expect("dependency file should be written");

        let mut results = Vec::new();
        let mut files_scanned = 0;
        search_directory(&root, "needle", &mut results, &mut files_scanned, 0);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 2);
        assert!(results[0].path.ends_with("main.rs"));
        std::fs::remove_dir_all(root).expect("temporary directory should be removed");
    }

    #[test]
    fn local_api_endpoint_supports_root_and_v1_base_urls() {
        let root = validate_local_api_base_url("http://127.0.0.1:1337").unwrap();
        let versioned = validate_local_api_base_url("http://127.0.0.1:1337/v1").unwrap();
        assert_eq!(
            local_api_endpoint(&root, "messages").unwrap().path(),
            "/v1/messages"
        );
        assert_eq!(
            local_api_endpoint(&versioned, "messages").unwrap().path(),
            "/v1/messages"
        );
    }

    #[test]
    fn local_api_rejects_unknown_protocols() {
        assert!(validate_local_api_protocol("openai").is_ok());
        assert!(validate_local_api_protocol("anthropic").is_ok());
        assert!(validate_local_api_protocol("gemini").is_err());
    }

    #[test]
    fn local_api_accepts_loopback_urls_and_rejects_remote_hosts() {
        for url in [
            "http://127.0.0.1:11434/v1",
            "http://localhost:1234/v1/",
            "http://[::1]:8080/v1",
            "https://127.0.0.1:9443/v1",
        ] {
            assert!(
                validate_local_api_base_url(url).is_ok(),
                "rejected local URL: {url}"
            );
        }
        for url in [
            "https://example.com/v1",
            "http://192.168.1.20:1234/v1",
            "http://0.0.0.0:8080/v1",
            "ftp://127.0.0.1/v1",
            "http://user:pass@127.0.0.1/v1",
            "http://127.0.0.1/v1?token=secret",
        ] {
            assert!(
                validate_local_api_base_url(url).is_err(),
                "accepted unsafe URL: {url}"
            );
        }
    }

    #[test]
    fn local_ai_rejects_invalid_roles_and_oversized_context() {
        let valid = LocalChatMessage {
            role: "user".into(),
            content: "hello".into(),
        };
        assert!(validate_local_chat_request("qwen2.5-coder", &[valid]).is_ok());

        let invalid_role = LocalChatMessage {
            role: "tool".into(),
            content: "run this".into(),
        };
        assert!(validate_local_chat_request("qwen2.5-coder", &[invalid_role]).is_err());

        let oversized = LocalChatMessage {
            role: "user".into(),
            content: "x".repeat(40_001),
        };
        assert!(validate_local_chat_request("qwen2.5-coder", &[oversized]).is_err());
    }
}
