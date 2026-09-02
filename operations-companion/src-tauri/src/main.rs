#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_host;

use native_host::{execute_operation, register_native_host, DesktopOperation};
use std::env;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn show_command_menu(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(Size::Logical(LogicalSize::new(230.0, 160.0)));
        if let Ok(cursor) = app.cursor_position() {
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(
                cursor.x as i32 + 8,
                cursor.y as i32 + 8,
            )));
        }
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("open-command-menu", ());
    }
}

#[tauri::command]
fn resize_menu(window: WebviewWindow, height: f64) -> Result<(), String> {
    let height = height.clamp(120.0, 360.0);
    window
        .set_size(Size::Logical(LogicalSize::new(230.0, height)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_menu(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn execute_desktop_operation(
    operation: DesktopOperation,
) -> Result<native_host::BridgeResponse, String> {
    execute_operation(operation)
}

fn main() {
    if env::args().any(|argument| argument == "--native-host") {
        native_host::run();
        return;
    }
    let modifier = if cfg!(target_os = "macos") {
        Modifiers::SUPER
    } else {
        Modifiers::CONTROL
    };
    let shortcut = Shortcut::new(Some(modifier), Code::KeyR);

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        show_command_menu(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            register_native_host()?;
            app.global_shortcut().register(shortcut)?;
            if let Some(window) = app.get_webview_window("main") {
                let window_to_hide = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::Focused(false)) {
                        let _ = window_to_hide.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_menu,
            resize_menu,
            execute_desktop_operation
        ])
        .run(tauri::generate_context!())
        .expect("启动运营工具快捷菜单失败");
}
