export type QueueTaskStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'prune'
export type QueueTaskStatusObject = Record<string, QueueTaskStatus>

// TODO: get row, column and other event types from mysqlevents module

// Sqlite database row
type Row = {
	id?: string,
	changeEvent: any,
    statuses?: any
}

// Emitted by binlog watcher
type BinlogEvent = {
    changeData: any,
    columns: any,
    database: string,
    filename: string,
    nextPosition: string,
    productCode: string,
    rows: any,
    table: string,
    timestamp: string,
    type: 'updaterows' | 'insertrows' | 'deleterows'
}

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

	// Runs task through plugin filters, saves to db/queue with statuses and kicks off the plugins
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
	
	// TODO: this name throws me off every time
	abstract getInitialStatus: (data: any) => QueueTaskStatus
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
			this.statuses[plugin.name] = plugin.getInitialStatus(this.task)
		})
	}

	setStatus = (pluginName: U, status: QueueTaskStatus): void => {
		this.statuses[pluginName] = status
	}
}