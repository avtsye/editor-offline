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
struct OllamaModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Debug, Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: &'a [LocalChatMessage],
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponseMessage {
    content: String,
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
async fn list_local_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| format!("יצירת חיבור מקומי נכשלה: {}", error))?;
    let response = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|_| {
            "לא ניתן להתחבר ל־Ollama בכתובת המקומית 127.0.0.1:11434. יש לוודא שהוא פועל."
                .to_string()
        })?;
    if !response.status().is_success() {
        return Err(format!("Ollama החזיר שגיאת HTTP: {}", response.status()));
    }

    let mut models = response
        .json::<OllamaModelsResponse>()
        .await
        .map_err(|error| format!("תשובת Ollama אינה תקינה: {}", error))?
        .models
        .into_iter()
        .map(|model| model.name)
        .collect::<Vec<_>>();
    models.sort();
    Ok(models)
}

#[tauri::command]
async fn chat_local_model(
    model: String,
    messages: Vec<LocalChatMessage>,
) -> Result<String, String> {
    validate_local_chat_request(&model, &messages)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("יצירת חיבור מקומי נכשלה: {}", error))?;
    let request = OllamaChatRequest {
        model: &model,
        messages: &messages,
        stream: false,
    };
    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&request)
        .send()
        .await
        .map_err(|_| "הבקשה למודל המקומי נכשלה. בדקו ש־Ollama עדיין פועל.".to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.chars().take(240).collect::<String>();
        return Err(format!("Ollama החזיר HTTP {}: {}", status, detail));
    }

    let response = response
        .json::<OllamaChatResponse>()
        .await
        .map_err(|error| format!("תשובת המודל אינה תקינה: {}", error))?;
    Ok(response.message.content)
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
        delete_path, limit_command_output, rename_path, search_directory, validate_child_name,
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
