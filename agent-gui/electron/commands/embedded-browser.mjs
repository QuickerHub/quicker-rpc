/**
 * @param {ReturnType<import('../embedded-browser/manager.mjs').createEmbeddedBrowserManager>} manager
 */
export function createEmbeddedBrowserCommands(manager) {
  return {
    embedded_browser_navigation_state() {
      return manager.readNavigationState();
    },
    embedded_browser_navigate(args) {
      manager.navigate(args?.url);
      return null;
    },
    embedded_browser_reload() {
      manager.reload();
      return null;
    },
    embedded_browser_go_back() {
      manager.goBack();
      return null;
    },
    embedded_browser_go_forward() {
      manager.goForward();
      return null;
    },
    embedded_browser_open_devtools() {
      manager.openDevtools();
      return null;
    },
    embedded_browser_toggle_devtools() {
      return manager.toggleDevtools();
    },
    embedded_browser_profile_info() {
      return manager.profileInfo();
    },
    embedded_browser_force_close() {
      return manager.forceClose();
    },
    /** Electron renderer mount (replaces Tauri Webview.create). */
    embedded_browser_mount(args) {
      manager.mount(args?.url, args);
      return null;
    },
    embedded_browser_set_bounds(args) {
      return manager.setBounds(args);
    },
    embedded_browser_set_visible(args) {
      manager.setVisible(args?.visible === true);
      return null;
    },
    embedded_browser_teardown() {
      manager.teardown();
      return null;
    },
  };
}
