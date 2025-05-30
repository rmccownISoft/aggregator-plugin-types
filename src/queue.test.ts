import { test, describe } from 'node:test'
import * as assert from 'node:assert'
import { QueuePlugin, QueueManager, QueueTask, QueueTaskStatus } from './queue'

// Create a concrete implementation of QueuePlugin for testing
class TestPlugin extends QueuePlugin<any, 'test'> {
    constructor(queue: QueueManager<any, 'test'>) {
        super('test', queue)
    }

    setInitialTaskStatus = (data: any): QueueTaskStatus => 'pending'
    processTask = async (task: QueueTask<any, 'test'>): Promise<void> => {}
}

describe('QueuePlugin', () => {
    test('kick should not call loop when syncInProgress is true', async () => {
        const queue = new QueueManager<any, 'test'>()
        queue.getNextTaskFor = () => undefined
        const plugin = new TestPlugin(queue)
        
        // Spy on the loop method
        const originalLoop = plugin.loop
        let loopCalled = false
        plugin.loop = async () => {
            loopCalled = true
            await originalLoop.call(plugin)
        }

        // Set syncInProgress to true
        plugin.waitingForSync = true
        
        // Call kick
        plugin.kick()
        
        // Verify loop was not called
        assert.strictEqual(loopCalled, false)
    })

    test('loop should not process tasks when syncInProgress is true', async () => {
        const queue = new QueueManager<any, 'test'>()
        queue.getNextTaskFor = () => undefined
        const plugin = new TestPlugin(queue)
        
        // Spy on processTask
        let processTaskCalled = false
        const originalProcessTask = plugin.processTask
        plugin.processTask = async (task) => {
            processTaskCalled = true
            await originalProcessTask.call(plugin, task)
        }

        // Set syncInProgress to true
        plugin.waitingForSync = true
        
        // Call loop directly
        await plugin.loop()
        
        // Verify processTask was not called
        assert.strictEqual(processTaskCalled, false)
    })

    test('kick should call loop once syncInProgress is set to false', async () => {
        const queue = new QueueManager<any, 'test'>()
        // Add mock implementation of getNextTaskFor
        queue.getNextTaskFor = () => undefined
        const plugin = new TestPlugin(queue)
        
        // Spy on the loop method
        const originalLoop = plugin.loop
        let loopCalled = false
        plugin.loop = async () => {
            loopCalled = true
            await originalLoop.call(plugin)
        }

        // Set syncInProgress to true initially
        plugin.waitingForSync = true
        
        // Call kick (should not call loop)
        plugin.kick()
        assert.strictEqual(loopCalled, false)
        
        // Set syncInProgress to false
        plugin.waitingForSync = false
        
        // Call kick again (should call loop)
        plugin.kick()
        assert.strictEqual(loopCalled, true)
    })

    test('mock sync method should retry every 30 seconds until status is idle', async () => {
        const queue = new QueueManager<any, 'test'>()
        queue.getNextTaskFor = () => undefined
        const plugin = new TestPlugin(queue)
        
        // Mock implementation of sync method with retry limit
        const mockSync = async (retryCount = 0) => {
            const MAX_RETRIES = 5 // Prevent endless loops
            
            // Always set waitingForSync first
            plugin.waitingForSync = true
            
            // Check status and retry if processing
            if (plugin.status === 'processing') {
                if (retryCount >= MAX_RETRIES) {
                    throw new Error('Max retries exceeded waiting for idle status')
                }
                // Wait 30 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 30))
                await mockSync(retryCount + 1)
            } else {
                // Status is idle, run mock job
                await new Promise(resolve => setTimeout(resolve, 5)) // Simulate mock job
                plugin.waitingForSync = false
            }
        }

        // Spy on the loop method to track calls
        const originalLoop = plugin.loop
        let loopCallCount = 0
        plugin.loop = async () => {
            loopCallCount++
            await originalLoop.call(plugin)
        }

        // Set initial state to processing
        plugin.status = 'processing'
        
        // Start the sync process
        const syncPromise = mockSync()
        
        // Verify waitingForSync is set immediately
        assert.strictEqual(plugin.waitingForSync, true)
        
        // Simulate status becoming idle after 30 seconds
        setTimeout(() => {
            plugin.status = 'idle'
        }, 35)
        
        // Wait for sync to complete
        await syncPromise
        
        // Verify waitingForSync is false after mock job completes
        assert.strictEqual(plugin.waitingForSync, false)
        
        // Verify loop was not called during sync
        assert.strictEqual(loopCallCount, 0)
        
        // Verify we can now process tasks
        plugin.kick()
        assert.strictEqual(loopCallCount, 1)

        // Test that max retries are enforced
        plugin.status = 'processing'
        await assert.rejects(
            async () => {
                // Don't set status to idle, forcing max retries
                await mockSync()
            },
            {
                name: 'Error',
                message: 'Max retries exceeded waiting for idle status'
            }
        )
    })
}) 