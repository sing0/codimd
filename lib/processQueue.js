'use strict'

const EventEmitter = require('events').EventEmitter

/**
 * Queuing Class for connection queuing
 */

const QueueEvent = {
  Tick: 'Tick'
}

class ProcessQueue extends EventEmitter {
  constructor (maximumLength, triggerTimeInterval = 10) {
    super()
    this.max = maximumLength
    this.triggerTime = triggerTimeInterval
    this.queue = []
    this.lock = false

    this.on(QueueEvent.Tick, () => {
      if (this.lock) return
      this.lock = true
      setImmediate(() => {
        this.process()
      })
    })
  }

  start () {
    if (this.eventTrigger) return
    this.eventTrigger = setInterval(() => {
      this.emit(QueueEvent.Tick)
    }, this.triggerTime)
  }

  stop () {
    if (this.eventTrigger) {
      clearInterval(this.eventTrigger)
      this.eventTrigger = null
    }
  }

  /**
   * push a promisify-task to queue
   * @param task {Promise}
   * @returns {boolean} if success return true, otherwise flase
   */
  push (task) {
    if (this.queue.length >= this.max) return false
    this.queue.push(task)
    this.start()
    this.emit(QueueEvent.Tick)
    return true
  }

  process () {
    if (this.queue.length <= 0) {
      this.stop()
      this.lock = false
      return
    }
    const task = this.queue.shift()

    const finishTask = () => {
      this.lock = false
      setImmediate(() => {
        this.emit(QueueEvent.Tick)
      })
    }
    task().then(finishTask).catch(finishTask)
  }
}

exports.ProcessQueue = ProcessQueue
