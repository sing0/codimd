'use strict'

const EventEmitter = require('events').EventEmitter

/**
 * Queuing Class for connection queuing
 */

const ConnectionQueueEvent = {
  Tick: 'Tick'
}

class ConnectionQueue extends EventEmitter {
  constructor (maximumLength, triggerTimeInterval = 10) {
    super()
    this.max = maximumLength
    this.triggerTime = triggerTimeInterval
    this.queue = []
    this.lock = false

    this.on(ConnectionQueueEvent.Tick, () => {
      if (this.lock) {
        return
      }
      this.lock = true
      process.nextTick(() => {
        this.process().then(() => {
          this.lock = false
        }).catch(() => {
          this.lock = false
        })
      })
    })
  }

  start () {
    this.eventTrigger = setInterval(() => {
      this.emit(ConnectionQueueEvent.Tick)
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
    return true
  }

  async process () {
    if (this.queue.length <= 0) return
    const task = this.queue.shift()
    return task()
  }
}

exports.ConnectionQueue = ConnectionQueue
