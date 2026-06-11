/**
 * @param {ReturnType<import('../embedded-browser/manager.mjs').createEmbeddedBrowserManager>} manager
 */
export function createEmbeddedBrowserCommands(manager) {
  return {
    embedded_browser_navigation_state(args) {
      return manager.readNavigationState(args?.browserId);
    },
    embedded_browser_navigate(args) {
      manager.navigate(args?.url, args?.browserId);
      return null;
    },
    embedded_browser_reload(args) {
      manager.reload(args?.browserId);
      return null;
    },
    embedded_browser_go_back(args) {
      manager.goBack(args?.browserId);
      return null;
    },
    embedded_browser_go_forward(args) {
      manager.goForward(args?.browserId);
      return null;
    },
    embedded_browser_open_devtools(args) {
      manager.openDevtools(args?.browserId);
      return null;
    },
    embedded_browser_toggle_devtools(args) {
      return manager.toggleDevtools(args?.browserId);
    },
    embedded_browser_profile_info() {
      return manager.profileInfo();
    },
    embedded_browser_force_close(args) {
      return manager.forceClose(args?.browserId);
    },
    /** Destroy one browser view (tab closed). */
    embedded_browser_close(args) {
      return manager.close(args?.browserId);
    },
    /** Electron renderer mount (replaces Tauri Webview.create). */
    embedded_browser_mount(args) {
      manager.mount(args?.url, args, args?.browserId);
      return null;
    },
    embedded_browser_set_bounds(args) {
      return manager.setBounds(args, args?.browserId);
    },
    embedded_browser_set_visible(args) {
      manager.setVisible(args?.visible === true, args?.browserId);
      return null;
    },
    embedded_browser_teardown() {
      manager.teardown();
      return null;
    },
    /** Start element pick mode; resolves with picked element or null. */
    embedded_browser_pick_element(args) {
      return manager.pickElement(args?.browserId);
    },
    embedded_browser_cancel_pick(args) {
      return manager.cancelPickElement(args?.browserId);
    },
  };
}
