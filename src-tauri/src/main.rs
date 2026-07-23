// 发布版本在 Windows 上不显示额外的控制台窗口，请勿删除。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    geotable_lib::run()
}
