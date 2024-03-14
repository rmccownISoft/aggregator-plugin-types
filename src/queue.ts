export type QueueTaskStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'prune'
export type QueueTaskStatusObject = Record<string, QueueTaskStatus>

// TODO: get row, column and other event types from mysqlevents module



export class QueueManager<Row, U extends string > {
	protected plugins: QueuePlugin<Row, U>[] = []

	// Gets next task for a plugin 
	getNextTaskFor: (pluginName: U) => QueueTask<Row, U> | undefined
	// Remove completed jobs from db/queue 
	prune: () => void
	// Save task to db/queue
	saveTask: (task: QueueTask<Row, U>) => void
	// Update the status object on a task
	updateQueueTaskStatus: (task: QueueTask<Row, U>, pluginName: U, status: QueueTaskStatus) => void

	/**
	 * Called by binlog event emitter
	 * @param convertedEvent 
	 * Converts the binlog event to a task, passes to the plugins to handle
	 * Plugin is responsible for setting status to 'pending' for later processing or 'skipped'
	 * Also responsible for kicking off the plugin's job handler
	 */
	enqueue = (convertedEvent: Row) => { 
		const task = new QueueTask<Row, U>(convertedEvent)
		// Run task through plugin filters
		task.initializeStatuses(this.plugins)
		// Save task to db or wherever
		this.saveTask(task)
		// Kick off the queue
		this.#kickAllPlugins()
	}

	registerPlugin = (plugin: QueuePlugin<Row, U>): void => {
		this.plugins.push(plugin)
	}

	#kickAllPlugins = (): void => {
		this.plugins.forEach(plugin => {
			plugin.kick()
		})
	}
}

export abstract class QueuePlugin<T, U extends string> {
	constructor (public readonly name: U, public readonly queue: QueueManager<T, U>) {}

	status: 'idle' | 'processing' = 'idle'
	
	
	/**
	 * Called by the queue manager on every binlog event.
	 * @param {Object} data - Usually a binlog event.
	 * @param {string} response - A status indicating whether the event is to be processed by setting to 'pending' otherwise 'skipped'.
	 * Most early plugins use an array of table names and binlog event types to determine if it will be processed or skipped.
	 */
	abstract setInitialTaskStatus: (data: any) => QueueTaskStatus
	/**
	 * Handles a task retrieved from sqlite queue
	 * @param {QueueTask}
	 * Most early plugins check an array of event types and functions to call for each
	 */
	abstract processTask: (task: QueueTask<T, U>) => void

	// TODO: There might need to be a required function to update to final status

	complete = async (task: QueueTask<T,U>): Promise<void> => {
		await this.queue.updateQueueTaskStatus(task, this.name, 'done')
		task.setStatus(this.name, 'done')
		task.statuses[this.name] = 'done'
		console.log('task complete: ', task)
	}
	// Calls the queue's implemented getNextTaskFor method
	getNextTask = (): QueueTask<T, U> | undefined => {
		return this.queue.getNextTaskFor(this.name)
	}	

	kick = (): void => {
		if (this.status === 'idle') {
			this.loop()
		}
	}

	loop = async (): Promise<void> => {
		this.status = 'processing'
		const currentTask = this.getNextTask()
		
		if (currentTask) {
			try {
				await this.processTask(currentTask)
			} catch (error) {
				console.error('Error in processTask loop: ', error)
			} finally {
				await this.complete(currentTask)

			}
			this.loop()
		} else {
			this.status = 'idle'
		}
	}
}

export class QueueTask<Row, U extends string> {
	constructor(readonly task: Row, initialStatuses?: Record<U, QueueTaskStatus>) {
		if (initialStatuses) {
			this.statuses = initialStatuses
		}
	}

	readonly statuses = {} as Record<U, QueueTaskStatus>

	initializeStatuses = (plugins: QueuePlugin<Row, U>[]): void => {
		plugins.forEach((plugin) => {
			this.statuses[plugin.name] = plugin.setInitialTaskStatus(this.task)
		})
	}

	setStatus = (pluginName: U, status: QueueTaskStatus): void => {
		this.statuses[pluginName] = status
	}
}