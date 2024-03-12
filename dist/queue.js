"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _QueueManager_kickAllPlugins;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueTask = exports.QueuePlugin = exports.QueueManager = void 0;
class QueueManager {
    constructor() {
        this.plugins = [];
        // Runs task through plugin filters, saves to db/queue with statuses and kicks off the plugins
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
        // TODO: There might need to be a required function to update to final status
        this.complete = async (task) => {
            await this.queue.updateQueueTaskStatus(task, this.name, 'done');
            task.setStatus(this.name, 'done');
            task.statuses[this.name] = 'done';
            console.log('task complete: ', task);
        };
        // Calls the queue's implemented getNextTaskFor method
        this.getNextTask = () => {
            return this.queue.getNextTaskFor(this.name);
        };
        this.kick = () => {
            if (this.status === 'idle') {
                this.loop();
            }
        };
        this.loop = async () => {
            this.status = 'processing';
            const currentTask = this.getNextTask();
            if (currentTask) {
                try {
                    await this.processTask(currentTask);
                }
                catch (error) {
                    console.error('Error in processTask loop: ', error);
                }
                finally {
                    await this.complete(currentTask);
                }
                this.loop();
            }
            else {
                this.status = 'idle';
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
                this.statuses[plugin.name] = plugin.getInitialStatus(this.task);
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
