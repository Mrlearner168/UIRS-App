import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import axios from "axios";
import queueService from "./queueService";

/*
|--------------------------------------------------------------------------
| Constants & Error Categories
|--------------------------------------------------------------------------
*/
const MAX_RETRY = 5;
const BASE_BACKOFF = 5000;
let processingLock = false;

const ERROR_CATEGORIES = {
    AUTH: 'Authentication',
    VALIDATION: 'Validation',
    DUPLICATE: 'Duplicate',
    NETWORK: 'Network_Offline',
    TIMEOUT: 'Timeout',
    SERVER: 'Server_Error',
    UNKNOWN: 'Unknown'
};

/*
|--------------------------------------------------------------------------
| Production Structured Logger
|--------------------------------------------------------------------------
*/
const Logger = {
    info: (msg, meta = {}) => { if (__DEV__) console.info(`[QUEUE_PROCESSOR] ${msg}`, meta); },
    warn: (msg, meta = {}) => { if (__DEV__) console.warn(`[QUEUE_PROCESSOR] ${msg}`, meta); },
    error: (msg, err = null) => { if (__DEV__) console.error(`[QUEUE_PROCESSOR] ${msg}`, err?.message || err); }
};

/*
|--------------------------------------------------------------------------
| Data Parsing & Statistics
|--------------------------------------------------------------------------
*/
const formatDateTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
};

const buildFormData = (report) => {
    const formData = new FormData();
    formData.append("incidentType", report.incidentType);
    formData.append("subType", report.subType || "");
    formData.append("incidentDescription", report.incidentDescription || "");
    formData.append("incidentTime", formatDateTime(report.incidentTime));
    formData.append("location", report.location || "");
    formData.append("processed_location", report.processed_location || "");

    if (report.incidentType === "Medical Emergency") {
        formData.append("isConscious", report.isConscious ? "true" : "false");
        formData.append("patientName", report.patientName || "");
        formData.append("patientAge", report.patientAge || "");
        formData.append("patientGender", report.patientGender || "");
    }

    if (Array.isArray(report.media)) {
        // Validate media objects, skipping malformed or null uris[cite: 2]
        report.media.filter(item => item && item.uri && typeof item.uri === 'string').forEach((item, index) => {
            formData.append("media", {
                uri: item.uri,
                name: item.name || `media_${index}_${Date.now()}.webp`,
                type: item.type || "image/webp"
            });
        });
    }
    return formData;
};

const getStatistics = async () => {
    const queue = await queueService.getQueue();
    const stats = { total: queue.length, pending: 0, uploading: 0, abandoned: 0 };
    queue.forEach(q => {
        const status = q.queue_meta?.upload_status;
        if (stats[status] !== undefined) stats[status]++;
    });
    return stats;
};

/*
|--------------------------------------------------------------------------
| Handlers & State Machine
|--------------------------------------------------------------------------
*/
const handleFailure = async (queueId, queueMeta, errorType, errMessage) => {
    const retryCount = (queueMeta.retry_count || 0) + 1;

    if (retryCount >= MAX_RETRY) {
        Logger.warn(`Max retries reached for ${queueId}. Marking abandoned.`);
        await queueService.updateReport(queueId, {
            retry_count: retryCount,
            last_retry: Date.now(),
            upload_status: "abandoned",
            last_error: errMessage
        });
        return { success: false, category: errorType, abandoned: true };
    }

    const backoffDelay = BASE_BACKOFF * Math.pow(2, retryCount - 1); // Exponential backoff
    await queueService.updateReport(queueId, {
        retry_count: retryCount,
        last_retry: Date.now(),
        next_retry: Date.now() + backoffDelay,
        upload_status: "pending", // State Machine: Returns to pending[cite: 2]
        last_error: errMessage
    });
    return { success: false, category: errorType, abandoned: false };
};

/*
|--------------------------------------------------------------------------
| Upload Single Report
|--------------------------------------------------------------------------
*/
const processReport = async (token, report) => {
    const meta = report.queue_meta;
    const queueId = meta.queue_id;

    if (meta.upload_status === "abandoned") return { skipped: true, reason: "abandoned" };
    if (Date.now() < meta.next_retry) return { skipped: true, reason: "backoff_window_active" };

    await queueService.updateReport(queueId, { upload_status: "uploading" });

    try {
        const formData = buildFormData(report);
        const response = await axios.post(`${SERVER_URL}/report_incident`, formData, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
            timeout: 20000
        });

        if (response.status >= 200 && response.status < 300) {
            await queueService.removeReport(queueId);
            return { success: true };
        }
        
        return await handleFailure(queueId, meta, ERROR_CATEGORIES.UNKNOWN, `Unexpected Status: ${response.status}`);

    } catch (err) {
        const status = err.response?.status;
        const code = err.code;

        // 1. Authentication (Stop Processing entirely)
        if (status === 401 || status === 403) {
            await queueService.updateReport(queueId, { upload_status: "pending" }); // Revert lock
            return { success: false, authExpired: true, category: ERROR_CATEGORIES.AUTH };
        }

        // 2. Duplicate Report (409) -> Remove immediately, never retry[cite: 2]
        if (status === 409) {
            Logger.info(`Duplicate detected for ${queueId}. Removing.`);
            await queueService.removeReport(queueId);
            return { success: false, duplicate: true, category: ERROR_CATEGORIES.DUPLICATE };
        }

        // 3. Validation / Invalid Data (400, 422) -> Remove immediately
        if (status === 400 || status === 422) {
            Logger.error(`Invalid report structure for ${queueId}. Removing to prevent loop.`);
            await queueService.removeReport(queueId);
            return { success: false, invalid: true, category: ERROR_CATEGORIES.VALIDATION };
        }

        // 4. Server Offline (5xx) or Timeout -> Retry Eligible
        if (status >= 500 || code === "ECONNABORTED" || !err.response) {
            const errType = code === "ECONNABORTED" ? ERROR_CATEGORIES.TIMEOUT : ERROR_CATEGORIES.SERVER;
            return await handleFailure(queueId, meta, errType, err.message);
        }

        // 5. Unknown Error
        return await handleFailure(queueId, meta, ERROR_CATEGORIES.UNKNOWN, err.message);
    }
};

/*
|--------------------------------------------------------------------------
| Process Queue (FIFO)
|--------------------------------------------------------------------------
*/
const processQueue = async (token) => {
    if (processingLock) return { success: false, message: "Queue lock active." };
    
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
        Logger.warn("Device is offline. Skipping queue processor.");
        return { success: false, message: "Offline" };
    }

    if (!token) return { success: false, authExpired: true };

    processingLock = true;
    try {
        let queue = await queueService.getQueue();
        if (!queue.length) return { success: true, total: 0 };

        // Ensure Strict FIFO ordering[cite: 2]
        queue.sort((a, b) => a.queue_meta.created_at - b.queue_meta.created_at);

        let results = { uploaded: 0, duplicates: 0, invalid: 0, failed: 0, skipped: 0 };

        for (const report of queue) {
            const result = await processReport(token, report);

            if (result.authExpired) {
                Logger.warn("Auth token expired mid-processing. Halting.");
                break; 
            }
            if (result.skipped) { results.skipped++; continue; }
            if (result.success) { results.uploaded++; continue; }
            if (result.duplicate) { results.duplicates++; continue; }
            if (result.invalid) { results.invalid++; continue; }
            results.failed++;
        }

        return {
            success: results.failed === 0,
            ...results,
            current_stats: await getStatistics()
        };
    } finally {
        processingLock = false;
    }
};

export default {
    processQueue,
    getStatistics
};