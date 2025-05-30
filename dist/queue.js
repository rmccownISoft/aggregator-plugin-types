"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _QueueManager_kickAllPlugins;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueTask = exports.QueuePlugin = exports.QueueManager = void 0;
// TODO: get row, column and other event types from mysqlevents module
class QueueManager {
    constructor() {
        this.plugins = [];
        /**
         * Called by binlog event emitter callback
         * @param convertedEvent
         * Converts the binlog event to a task, passes to the plugins to handle
         * Plugin is responsible for setting status to 'pending' for later processing or 'skipped'
         * Also responsible for kicking off the plugin's job handler
         */
        this.enqueue = (convertedEvent) => {
            const task = new QueueTask(convertedEvent);
            // Run task through plugin filters
            task.initializeStatuses(this.plugins);
            // Save task to db or wherever
            this.saveTask(task);
            // Kick off the queue
            __classPrivateFieldGet(this, _QueueManager_kickAllPlugins, "f").call(this);
        };
        this.registerPlugin = (plugin) => {
            this.plugins.push(plugin);
        };
        _QueueManager_kickAllPlugins.set(this, () => {
            this.plugins.forEach(plugin => {
                plugin.kick();
            });
        });
    }
}
exports.QueueManager = QueueManager;
_QueueManager_kickAllPlugins = new WeakMap();
class QueuePlugin {
    constructor(name, queue) {
        this.name = name;
        this.queue = queue;
        this.status = 'idle';
        this.waitingForSync = false;
        // TODO: There might need to be a required function to update to final status
        this.complete = async (task) => {
            await this.queue.updateQueueTaskStatus(task, this.name, 'done');
            task.setStatus(this.name, 'done');
            task.statuses[this.name] = 'done';
        };
        // Calls the queue's implemented getNextTaskFor method
        this.getNextTask = () => {
            return this.queue.getNextTaskFor(this.name);
        };
        this.kick = () => {
            // Needed additional flag to handle the interruption of an optional resync which takes priority
            if (this.status === 'idle' && !this.waitingForSync) {
                this.loop();
            }
        };
        // Since loop can get called by itself, it also needs to only proceed if not waitingForSync.
        // Syncing is considered a higher priority so it should also be responsible for managing the waitingForSync flag
        this.loop = async () => {
            // This should only be possible if called by itself after processing a task when aresync was requested
            if (this.waitingForSync) {
                // Set status to idle so that resync can take over
                this.status = 'idle';
            }
            else {
                this.status = 'processing';
                const currentTask = this.getNextTask();
                if (currentTask) {
                    try {
                        await this.processTask(currentTask);
                    }
                    catch (error) {
                        console.error('Error in process task loop: ', error);
                    }
                    finally {
                        await this.complete(currentTask);
                    }
                    this.loop();
                }
                else {
                    this.status = 'idle';
                }
            }
        };
    }
}
exports.QueuePlugin = QueuePlugin;
class QueueTask {
    constructor(task, initialStatuses) {
        this.task = task;
        this.statuses = {};
        this.initializeStatuses = (plugins) => {
            plugins.forEach((plugin) => {
                this.statuses[plugin.name] = plugin.setInitialTaskStatus(this.task);
            });
        };
        this.setStatus = (pluginName, status) => {
            this.statuses[pluginName] = status;
        };
        if (initialStatuses) {
            this.statuses = initialStatuses;
        }
    }
}
exports.QueueTask = QueueTask;
