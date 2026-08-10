import { Platform } from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";

/*
|--------------------------------------------------------------------------
| Constants & Configuration
|--------------------------------------------------------------------------
*/
const STORAGE_KEY = "offline_reports";
const CORRUPTED_STORAGE_KEY = "offline_reports_corrupted";
const MAX_QUEUE_SIZE = 100;
const APP_VERSION = "1.0.0"; // Usually pulled from DeviceInfo

/*
|--------------------------------------------------------------------------
| Production Structured Logger
|--------------------------------------------------------------------------
*/
const Logger = {
    info: (msg, meta = {}) => { if (__DEV__) console.info(`[QUEUE_SERVICE] ${msg}`, meta); },
    warn: (msg, meta = {}) => { if (__DEV__) console.warn(`[QUEUE_SERVICE] ${msg}`, meta); },
    error: (msg, err = null) => { 
        // In production, route to Sentry/Crashlytics. DO NOT log PII.
        if (__DEV__) console.error(`[QUEUE_SERVICE] ${msg}`, err?.message || err); 
    }
};

/*
|--------------------------------------------------------------------------
| Atomic Mutex Lock
|--------------------------------------------------------------------------
*/
class AsyncMutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
    async lock() {
        return new Promise(resolve => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
    unlock() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
}
const queueMutex = new AsyncMutex();

/*
|--------------------------------------------------------------------------
| UUID v4 Generator
|--------------------------------------------------------------------------
*/
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/*
|--------------------------------------------------------------------------
| Schema-Aware Validation
|--------------------------------------------------------------------------
*/
const validateReport = (report) => {
    if (!report) return { valid: false, reason: "Payload is null or undefined" };
    if (!report.incidentType) return { valid: false, reason: "incidentType is required" };
    if (!report.location) return { valid: false, reason: "location is required" };
    if (!report.processed_location?.trim()) return { valid: false, reason: "processed_location is required and cannot be empty" };
    if (!report.incidentTime) return { valid: false, reason: "incidentTime is required" };
    if (!Array.isArray(report.media)) return { valid: false, reason: "media must be an array" };
    
    // Validate Medical Emergency fields if applicable
    if (report.incidentType === "Medical Emergency") {
        if (typeof report.isConscious !== 'boolean' && report.isConscious !== null) {
             return { valid: false, reason: "isConscious must be a boolean" };
        }
    }
    
    // Station IDs are intentionally not validated as backend handles assignment[cite: 2]
    return { valid: true };
};

/*
|--------------------------------------------------------------------------
| Core Queue Operations
|--------------------------------------------------------------------------
*/
const getQueue = async () => {
    try {
        const stored = await EncryptedStorage.getItem(STORAGE_KEY);
        if (!stored) return [];

        const queue = JSON.parse(stored);
        if (!Array.isArray(queue)) throw new Error("Parsed queue is not an array");
        
        return queue;
    } catch (err) {
        Logger.error("Queue corruption detected.", err);
        
        // Backup corrupted string and recreate empty queue to prevent crashes
        try {
            const rawStored = await EncryptedStorage.getItem(STORAGE_KEY);
            if (rawStored) await EncryptedStorage.setItem(CORRUPTED_STORAGE_KEY, rawStored);
            await EncryptedStorage.removeItem(STORAGE_KEY);
        } catch (backupErr) {
            Logger.error("Failed to backup corrupted queue", backupErr);
        }
        return [];
    }
};

const saveQueue = async (queue) => {
    try {
        await EncryptedStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        return true;
    } catch (err) {
        Logger.error("Failed saving queue to EncryptedStorage.", err);
        return false;
    }
};

const enqueueReport = async (report) => {
    const validation = validateReport(report);
    if (!validation.valid) {
        Logger.warn(`Enqueue validation failed: ${validation.reason}`);
        return { success: false, message: validation.reason };
    }

    await queueMutex.lock();
    try {
        let queue = await getQueue();

        // Enforce MAX_QUEUE_SIZE
        if (queue.length >= MAX_QUEUE_SIZE) {
            Logger.warn(`Queue size limit (${MAX_QUEUE_SIZE}) reached. Removing oldest pending report.`);
            const oldestPendingIndex = queue.findIndex(q => q.queue_meta.upload_status === "pending");
            if (oldestPendingIndex !== -1) {
                queue.splice(oldestPendingIndex, 1);
            } else {
                queue.shift(); // Fallback if no 'pending' found
            }
        }

        const queue_id = generateUUID();
        const queuedReport = {
            ...report,
            queue_meta: {
                queue_id,
                created_at: Date.now(),
                retry_count: 0,
                last_retry: null,
                next_retry: Date.now(), // Process immediately on first run
                upload_status: "pending", // Replaces top-level status[cite: 3]
                last_error: null,
                app_version: APP_VERSION,
                platform: Platform.OS
            }
        };

        queue.push(queuedReport);
        await saveQueue(queue);
        
        Logger.info(`Report enqueued successfully. ID: ${queue_id}`);
        return { success: true, queue_id, queue_size: queue.length };
    } catch (err) {
        Logger.error("Failed enqueueing report.", err);
        return { success: false, message: err.message };
    } finally {
        queueMutex.unlock();
    }
};

const updateReport = async (queueId, metaUpdates) => {
    await queueMutex.lock();
    try {
        const queue = await getQueue();
        const index = queue.findIndex(item => item.queue_meta?.queue_id === queueId);
        
        if (index === -1) {
            Logger.warn(`Update failed: Queue ID not found (${queueId})`);
            return false;
        }

        // Only update metadata to preserve the original payload integrity
        queue[index].queue_meta = { ...queue[index].queue_meta, ...metaUpdates };
        await saveQueue(queue);
        return true;
    } catch (err) {
        Logger.error("Failed updating report.", err);
        return false;
    } finally {
        queueMutex.unlock();
    }
};

const removeReport = async (queueId) => {
    await queueMutex.lock();
    try {
        const queue = await getQueue();
        const filtered = queue.filter(item => item.queue_meta?.queue_id !== queueId);
        await saveQueue(filtered);
        Logger.info(`Removed report: ${queueId}`);
        return true;
    } catch (err) {
        Logger.error("Failed removing report.", err);
        return false;
    } finally {
        queueMutex.unlock();
    }
};

export default {
    getQueue,
    enqueueReport,
    updateReport,
    removeReport
};