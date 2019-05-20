/* eslint-env node, mocha */
'use strict'

const assert = require('assert')
const mock = require('mock-require')
const sinon = require('sinon')

const {createFakeLogger} = require('../testDoubles/loggerFake')
const {removeModuleFromRequireCache ,removeLibModuleCache, makeMockSocket} = require('./utils')
const realtimeJobStub = require('../testDoubles/realtimeJobStub')

describe('realtime#connection', function () {
  describe('connection', function () {
    let realtime
    let modelStub

    beforeEach(() => {
      removeLibModuleCache()
      modelStub = {
        Note: {
          findOne: sinon.stub()
        },
        User: {},
        Author: {}
      }
      mock('../../lib/logger', createFakeLogger())
      mock('../../lib/history', {})
      mock('../../lib/models', modelStub)
      mock('../../lib/config', {})
      mock('../../lib/realtimeUpdateDirtyNoteJob', realtimeJobStub)
      mock('../../lib/realtimeCleanDanglingUserJob', realtimeJobStub)
      mock('../../lib/realtimeSaveRevisionJob', realtimeJobStub)
      mock('../../lib/ot', require('../testDoubles/otFake'))
      realtime = require('../../lib/realtime')
    })

    afterEach(() => {
      mock.stopAll()
      sinon.restore()
    })

    describe('fail', function () {
      it('should fast return when server not start', () => {
        const mockSocket = makeMockSocket()
        realtime.maintenance = true
        const spy = sinon.spy(realtime, 'parseNoteIdFromSocket')
        realtime.connection(mockSocket)
        assert(!spy.called)
      })

      it('should failed when parse noteId occur error', () => {
        const mockSocket = makeMockSocket()
        realtime.maintenance = false
        const parseNoteIdFromSocketSpy = sinon.stub(realtime, 'parseNoteIdFromSocket').callsFake((socket, callback) => {
          /* eslint-disable-next-line */
          callback('error', null)
        })

        const failConnectionSpy = sinon.stub(realtime, 'failConnection')

        realtime.connection(mockSocket)

        assert(parseNoteIdFromSocketSpy.called)
        assert(failConnectionSpy.calledOnce)
        assert.deepStrictEqual(failConnectionSpy.lastCall.args, [500, 'error', mockSocket])
      })

      it('should failed when noteId not exists', () => {
        const mockSocket = makeMockSocket()
        realtime.maintenance = false
        const parseNoteIdFromSocketSpy = sinon.stub(realtime, 'parseNoteIdFromSocket').callsFake((socket, callback) => {
          /* eslint-disable-next-line */
          callback(null, null)
        })

        const failConnectionSpy = sinon.stub(realtime, 'failConnection')

        realtime.connection(mockSocket)

        assert(parseNoteIdFromSocketSpy.called)
        assert(failConnectionSpy.calledOnce)
        assert.deepStrictEqual(failConnectionSpy.lastCall.args, [404, 'note id not found', mockSocket])
      })
    })

    it('should success connect', function () {
      const mockSocket = makeMockSocket()
      const noteId = 'note123'
      realtime.maintenance = false
      const parseNoteIdFromSocketSpy = sinon.stub(realtime, 'parseNoteIdFromSocket').callsFake((socket, callback) => {
        /* eslint-disable-next-line */
        callback(null, noteId)
      })
      const failConnectionStub = sinon.stub(realtime, 'failConnection')
      const updateUserDataStub = sinon.stub(realtime, 'updateUserData')
      const startConnectionStub = sinon.stub(realtime, 'startConnection')

      realtime.connection(mockSocket)

      assert.ok(parseNoteIdFromSocketSpy.calledOnce)

      assert(failConnectionStub.called === false)
      assert(updateUserDataStub.calledOnce)
      assert(startConnectionStub.calledOnce)
      assert(mockSocket.on.callCount === 11)
    })

    describe('flow', function () {
      it('should establish connection', function (done) {
        const noteId = 'note123'
        const mockSocket = makeMockSocket(null, {
          noteId: noteId
        })
        mockSocket.request.user.logged_in = true
        mockSocket.request.user.id = 'user1'
        mockSocket.noteId = noteId
        realtime.maintenance = false
        sinon.stub(realtime, 'parseNoteIdFromSocket').callsFake((socket, callback) => {
          /* eslint-disable-next-line */
          callback(null, noteId)
        })
        const updateHistoryStub = sinon.stub(realtime, 'updateHistory')
        const emitOnlineUsersStub = sinon.stub(realtime, 'emitOnlineUsers')
        const emitRefreshStub = sinon.stub(realtime, 'emitRefresh')
        const failConnectionSpy = sinon.spy(realtime, 'failConnection')

        let note = {
          id: noteId,
          authors: [
            {
              user: {
                userId: 'user1',
                color: 'red',
                name: 'Alice'
              }
            },
            {
              user: {
                userId: 'user2',
                color: 'blue',
                name: 'Bob'
              }
            }
          ]
        }
        modelStub.Note.findOne.returns(Promise.resolve(note))
        modelStub.User.getProfile = sinon.stub().callsFake((user) => {
          return user
        })
        sinon.stub(realtime, 'checkViewPermission').returns(true)
        realtime.connection(mockSocket)
        setTimeout(() => {
          assert(modelStub.Note.findOne.calledOnce)
          assert.deepStrictEqual(modelStub.Note.findOne.lastCall.args[0].include, [
            {
              model: modelStub.User,
              as: 'owner'
            }, {
              model: modelStub.User,
              as: 'lastchangeuser'
            }, {
              model: modelStub.Author,
              as: 'authors',
              include: [{
                model: modelStub.User,
                as: 'user'
              }]
            }
          ])
          assert(modelStub.Note.findOne.lastCall.args[0].where.id === noteId)
          assert(updateHistoryStub.calledOnce)
          assert(emitOnlineUsersStub.calledOnce)
          assert(emitRefreshStub.calledOnce)
          assert(failConnectionSpy.callCount === 0)
          assert(realtime.getNotePool()[noteId].id === noteId)
          assert(realtime.getNotePool()[noteId].socks.length === 1)
          assert(Object.keys(realtime.getNotePool()[noteId].users).length === 1)
          done()
        }, 50)
      })
    })
  })
})
