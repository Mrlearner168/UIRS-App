import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

// Matches the getName() in UirsPermissionsModule.kt
const { UirsPermissions } = NativeModules;

export const PermissionService = {
  
  /**
   * Checks the complete system health.
   * Returns a detailed object with all permission statuses.
   */
  checkHealth: async () => {
    if (Platform.OS !== 'android') return null;
    try {
      const health = await UirsPermissions.checkHealth();
      console.log("🏥 UIRS Health Report:", health);
      return health;
    } catch (error) {
      console.error("Health Check Failed:", error);
      return null;
    }
  },

  /**
   * Opens the specific settings page OR requests runtime permissions.
   * @param {string} type - 'runtime', 'overlay', 'battery', 'fsi', 'dnd', 'alarm', 'autostart', 'notification'
   */
  fixPermission: async (type) => {
    if (Platform.OS !== 'android') return;
    
    try {
      // 1. Handle Standard Runtime Permissions (The "Dialog")
      if (type === 'runtime') {
        const permsToRequest = [
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        ];

        // Add Notification Permission for Android 13+ (API 33)
        if (Platform.Version >= 33) {
          permsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }

        const result = await PermissionsAndroid.requestMultiple(permsToRequest);
        console.log("Permission Dialog Result:", result);
        return;
      }

      // 2. Handle System Settings
      if (type === 'autostart') {
        await UirsPermissions.openAutoStart();
      } else {
        // Covers: overlay, battery, alarm, fsi, dnd, notification
        await UirsPermissions.openSettings(type);
      }
    } catch (error) {
      console.error(`Failed to handle permission for ${type}:`, error);
    }
  },

  /**
   * Helper to determine the highest priority missing permission.
   * Use this to show a "Fix This First" UI.
   */
  getNextAction: (health) => {
    if (!health) return null;

    // 1. Critical: Runtime Permissions (Camera, Mic, Location)
    if (!health.runtimeGranted) {
      const missing = health.missingRuntimePermissions || [];
      const labels = [];
      
      // Map standard Android permission strings to human-readable labels
      if (missing.some(p => p.includes("CAMERA"))) labels.push("Camera");
      if (missing.some(p => p.includes("LOCATION"))) labels.push("Location");
      if (missing.some(p => p.includes("AUDIO") || p.includes("MICROPHONE"))) labels.push("Microphone");
      if (missing.some(p => p.includes("POST_NOTIFICATIONS"))) labels.push("Notifications");
      
      const labelText = labels.length > 0 ? labels.join(" & ") : "Permissions";
      return { type: 'runtime', label: `Grant ${labelText}` };
    }

    // 2. Critical: Hidden Manufacturer Blocks (Xiaomi, Oppo, Vivo, etc.)
    // Logic: If it's a "High Risk" device AND (AutoStart is explicitly OFF OR we just don't know/Manual Check Required)
    if (health.hiddenRisks?.isHighRiskDevice) {
       const { miuiAutoStartGranted, manualCheckRequired } = health.hiddenRisks;
       
       // Xiaomi returns explicit false. Oppo/Vivo return true but set manualCheckRequired to true.
       if (miuiAutoStartGranted === false || manualCheckRequired === true) {
          return { type: 'autostart', label: 'Enable Auto-Start / Background' };
       }
    }

    // 3. Critical: Background Execution
    if (!health.overlayGranted) return { type: 'overlay', label: 'Allow "Appear on Top"' };
    if (!health.batteryGranted) return { type: 'battery', label: 'Set Battery to "Unrestricted"' };

    // 4. Critical: Reliability (Alarms & Notifications)
    // "alarmGranted" is relevant for Android 12+ (API 31+)
    if (health.alarmGranted === false) return { type: 'alarm', label: 'Allow "Alarms & Reminders"' };
    
    // Check if system-level notifications are turned off entirely
    if (health.notificationsEnabled === false) return { type: 'notification', label: 'Turn on Notifications' };

    // 5. Critical: Sound & Lock Screen
    if (!health.dndGranted) return { type: 'dnd', label: 'Allow "Do Not Disturb" Access' };
    if (!health.fsiGranted) return { type: 'fsi', label: 'Allow "Full Screen Intent"' };

    return null; // System is Robust!
  }
};