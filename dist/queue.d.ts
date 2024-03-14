export declare type QueueTaskStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'prune';
export declare type QueueTaskStatusObject = Record<string, QueueTaskStatus>;
export declare class QueueManager<Row, U extends string> {
    #private;
    protected plugins: QueuePlugin<Row, U>[];
    getNextTaskFor: (pluginName: U) => QueueTask<Row, U> | undefined;
    prune: () => void;
    saveTask: (task: QueueTask<Row, U>) => void;
    updateQueueTaskStatus: (task: QueueTask<Row, U>, pluginName: U, status: QueueTaskStatus) => void;
    enqueue: (convertedEvent: Row) => void;
    registerPlugin: (plugin: QueuePlugin<Row, U>) => void;
}
export declare abstract class QueuePlugin<T, U extends string> {
    readonly name: U;
    readonly queue: QueueManager<T, U>;
    constructor(name: U, queue: QueueManager<T, U>);
    status: 'idle' | 'processing';
    abstract setInitialTaskStatus: (data: any) => QueueTaskStatus;
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
