export declare type QueueTaskStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'prune';
export declare type QueueTaskStatusObject = Record<string, QueueTaskStatus>;
export declare class QueueManager<Row, U extends string> {
    #private;
    protected plugins: QueuePlugin<Row, U>[];
    getNextTaskFor: (pluginName: U) => QueueTask<Row, U> | undefined;
    prune: () => void;
    saveTask: (task: QueueTask<Row, U>) => void;
    updateQueueTaskStatus: (task: QueueTask<Row, U>, pluginName: U, status: QueueTaskStatus) => void;
    /**
     * Called by binlog event emitter
     * @param convertedEvent
     * Converts the binlog event to a task, passes to the plugins to handle
     * Plugin is responsible for setting status to 'pending' for later processing or 'skipped'
     * Also responsible for kicking off the plugin's job handler
     */
    enqueue: (convertedEvent: Row) => void;
    registerPlugin: (plugin: QueuePlugin<Row, U>) => void;
}
export declare abstract class QueuePlugin<T, U extends string> {
    readonly name: U;
    readonly queue: QueueManager<T, U>;
    constructor(name: U, queue: QueueManager<T, U>);
    status: 'idle' | 'processing';
    /**
     * Called by the queue manager on every binlog event.
     * @param {Object} data - Usually a binlog event.
     * @param {string} response - A status indicating whether the event is to be processed by setting to 'pending' otherwise 'skipped'.
     * Most early plugins use an array of table names and binlog event types to determine if it will be processed or skipped.
     */
    abstract setInitialTaskStatus: (data: any) => QueueTaskStatus;
    /**
     * Handles a task retrieved from sqlite queue
     * @param {QueueTask}
     * Most early plugins check an array of event types and functions to call for each
     */
    abstract processTask: (task: QueueTask<T, U>) => void;
    complete: (task: QueueTask<T, U>) => Promise<void>;
    getNextTask: () => QueueTask<T, U> | undefined;
    kick: () => void;
    loop: () => Promise<void>;
}
export declare class QueueTask<Row, U extends string> {
    readonly task: Row;
    constructor(task: Row, initialStatuses?: Record<U, QueueTaskStatus>);
    readonly statuses: Record<U, QueueTaskStatus>;
    initializeStatuses: (plugins: QueuePlugin<Row, U>[]) => void;
    setStatus: (pluginName: U, status: QueueTaskStatus) => void;
}
