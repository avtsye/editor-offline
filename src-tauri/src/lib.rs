use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
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
        return Err(format!(
            "כבר קיים פריט בשם: {}",
            destination.display()
        ));
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
            get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Editor Offline");
}

#[cfg(test)]
mod tests {
    use super::validate_child_name;

    #[test]
    fn accepts_simple_file_and_folder_names() {
        assert!(validate_child_name("main.rs").is_ok());
        assert!(validate_child_name("src").is_ok());
        assert!(validate_child_name("קובץ חדש.txt").is_ok());
    }

    #[test]
    fn rejects_empty_or_traversal_names() {
        for name in ["", ".", "..", "../escape", "nested/file", "nested\\\\file"] {
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
}
