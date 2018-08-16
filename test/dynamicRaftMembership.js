const fs = require('fs-extra')
const expect = require('chai').expect

let util = require('../util.js')

let parentPath = null

const node1Path = 'test/node1'
let newRaftNetwork = null 
let node1Config = null 
let node1 = null

const node2Path = 'test/node2'
let joinExisting = null 
let node2Config = null 
let node2 = null

describe("RAFT consensus", function() {
  this.timeout(100*1000)
  describe("Coordinating node", function() {
    it("Should start a coordinating raft node", function(done) {
      parentPath = process.cwd()
      process.chdir(node1Path)

      node1Config.setup.role = 'coordinator'
      node1Config.setup.automatedSetup = true
      node1Config.ports.communicationNode = 50000
      node1Config.ports.communicationNodeRpc = 50010
      node1Config.ports.communicationNodeWsRpc = 50020
      node1Config.ports.gethNode = 20000 
      node1Config.ports.gethNodeRpc = 20010
      node1Config.ports.gethNodeWsRpc = 20020
      node1Config.ports.raftHttp = node1Config.ports.gethNode + 20000
      node1Config.ports.constellation = 9000
      newRaftNetwork.HandleStartingNewRaftNetwork(node1Config.setup, function(err, result){
        if(err){console.log('ERROR:', err)} 
        node1 = result
        setTimeout(function(){
          done()
        }, 2000)
      })
    })
    it("should have a web3HttpRpc object", function(){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      expect(web3HttpRpc).to.not.be.undefined
    })
    it("should be able to get accounts", function(done){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getAccounts(function(err, accounts){
        expect(accounts).to.be.an('array')
        done()
      })
    })
    it("should be able to get blockNumber", function(done){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getBlockNumber(function(err, blockNumber){
        expect(blockNumber).to.equal(0)
        done()
      })
    })
    it("should have a web3HttpRaft object", function(){
      let web3HttpRaft = node1.raftNetwork.web3HttpRaft
      expect(web3HttpRaft).to.not.be.undefined
    })
    it("should have a web3WsRpc object", function(){
      let web3WsRpc = node1.raftNetwork.web3WsRpc
      expect(web3WsRpc).to.not.be.undefined
    })
    /*it("should be elected as the minter", function(done){
      let web3HttpRaft = node1.raftNetwork.web3HttpRaft
      console.log('web3HttpRaft.raft:', web3HttpRaft.raft)
      web3HttpRaft.raft.getRole(function(err, role){
        console.log('getRole ERROR:', err)
        console.log('role:', role)
        expect(role).to.equal('minter')
        done()
      })
    })*/
    it("should have a web3Ipc object", function(){
      let web3Ipc = node1.raftNetwork.web3Ipc
      expect(web3Ipc).to.not.be.undefined
    })
    it("should be able to create an account", function(done){
      let web3Ipc = node1.raftNetwork.web3Ipc
      web3Ipc.personal.newAccount('', function(err, accountAddress){
        if(err){console.log('ERROR:', err)}
        expect(accountAddress).to.be.a('string')
        done()
      })
    })
    it("should be able to transfer between accounts", function(done){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getAccounts(function(err, accounts){
        if(err){console.log('ERROR:', err)}
        let account0 = accounts[0]
        let account1 = accounts[1]
        web3HttpRpc.eth.sendTransaction({from:account0, to:account1, value:123}, function(err, txid){
          if(err){console.log('ERROR:', err)}
          expect(txid).to.be.a('string')
          setTimeout(function(){
            done()
          }, 1000)
        })
      })
    })
    it("should be able to get balance of account", function(done){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getAccounts(function(err, accounts){
        if(err){console.log('ERROR:', err)}
        let account1 = accounts[1]
        web3HttpRpc.eth.getBalance(account1, function(err, balance){
          if(err){console.log('ERROR:', err)}
          let iBalance = Number(balance.toString())
          expect(iBalance).to.be.greaterThan(0)
          done()
        })
      })
    })
    it("blockNumber should now be greater than 0", function(done){
      let web3HttpRpc = node1.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getBlockNumber(function(err, blockNumber){
        expect(blockNumber).to.be.greaterThan(0)
        done()
      })
    })
  })
  describe("Dynamic membership node", function() {
    it("Should start a dynamic raft membership node", function(done) {
      process.chdir(parentPath)
      process.chdir(node2Path)

      node2Config.setup.role = 'dynamicPeer'
      node2Config.setup.automatedSetup = true
      node2Config.setup.remoteIpAddress = '127.0.0.1'
      node2Config.ports.communicationNode = 50002
      node2Config.ports.remoteCommunicationNode = 50000
      node2Config.ports.communicationNodeRpc = 50012
      node2Config.ports.communicationNodeWsRpc = 50022
      node2Config.ports.gethNode = 20002 
      node2Config.ports.gethNodeRpc = 20012
      node2Config.ports.gethNodeWsRpc = 20022
      node2Config.ports.raftHttp = node2Config.ports.gethNode + 20000
      node2Config.ports.constellation = 9002
      joinExisting.HandleJoiningRaftNetwork(node2Config.setup, function(err, result){
        if(err){console.log('ERROR:', err)} 
        node2 = result
        setTimeout(function(){
          done()
        }, 2000)
      })
    })
    it("should have a web3HttpRpc object", function(){
      let web3HttpRpc = node2.raftNetwork.web3HttpRpc
      expect(web3HttpRpc).to.not.be.undefined
    })
    it("should be able to get accounts", function(done){
      let web3HttpRpc = node2.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getAccounts(function(err, accounts){
        expect(accounts).to.be.an('array')
        done()
      })
    })
    it("should be able to get blockNumber", function(done){
      let web3HttpRpc = node2.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getBlockNumber(function(err, blockNumber){
        if(err){console.log('get blocknumber ERROR:', err)}
        expect(blockNumber).to.be.greaterThan(0)
        done()
      })
    })
    it("should have a web3WsRpc object", function(){
      let web3WsRpc = node2.raftNetwork.web3WsRpc
      expect(web3WsRpc).to.not.be.undefined
    })
    it("should have a web3HttpRaft object", function(){
      let web3HttpRaft = node2.raftNetwork.web3HttpRaft
      expect(web3HttpRaft).to.not.be.undefined
    })
    //it("should be elected as a verifier", function(){
    //  let web3HttpRaft = node2.raftNetwork.web3HttpRaft
    //  expect(web3HttpRaft.raft.role).to.equal('verifier')
    //})
    it("should have a web3Ipc object", function(){
      let web3Ipc = node2.raftNetwork.web3Ipc
      expect(web3Ipc).to.not.be.undefined
    })
    it("should have peers", function(done){
      let web3Ipc = node2.raftNetwork.web3Ipc
      web3Ipc.admin.peers(function(err, peers){
        if(err){console.log('ERROR:', err)}
        expect(peers).to.be.an('array')
        expect(peers.length).to.equal(1)
        done()
      })
    })
    it("should be able to create an account", function(done){
      let web3Ipc = node2.raftNetwork.web3Ipc
      web3Ipc.personal.newAccount('', function(err, accountAddress){
        if(err){console.log('ERROR:', err)}
        expect(accountAddress).to.be.a('string')
        done()
      })
    })
    it("should be able to get balance of account", function(done){
      let web3HttpRpc = node2.raftNetwork.web3HttpRpc
      web3HttpRpc.eth.getAccounts(function(err, accounts){
        let account1 = accounts[1]
        web3HttpRpc.eth.getBalance(account1, function(err, balance){
          if(err){console.log('ERROR:', err)}
          let iBalance = Number(balance.toString())
          expect(iBalance).to.be.a('number')
          done()
        })
      })
    })
  })
  before(function(done){
    setupDirectoriesAndFolders(node1Path)
    setupDirectoriesAndFolders(node2Path)

    newRaftNetwork = require('./node1/newRaftNetwork.js')
    node1Config = require('./node1/config.js')
    joinExisting = require('./node2/joinExistingRaftNetwork.js')
    node2Config = require('./node2/config.js')
    done()
  })
  after(function(done){
    process.chdir(parentPath)
    util.KillallGethConstellationNode(function(){
      done()
    })    
  })
})

function setupDirectoriesAndFolders(path){
  if (fs.existsSync(path)){
    fs.removeSync(path)
  }
  fs.mkdirSync(path)
  fs.copySync('.', path, {filter: copyFilter})
}

function copyFilter(src, dest){
  if(src.indexOf('Blockchain') >= 0){
    return false
  } else if(src.indexOf('test') >= 0){
    return false
  } else if(src.indexOf('.log') >= 0){
    return false
  } else if(src.indexOf('README.md') >= 0){
    return false
  } else if(src.indexOf('Constellation') >= 0){
    return false
  } else if(src.indexOf('CommunicationNode') >= 0 && src != 'startCommunicationNode.sh'){
    return false
  } else if(src.indexOf('git') >= 0){
    return false
  } else if(src.indexOf('swp') >= 0){
    return false
  } else if(src.indexOf('static-nodes.json') >= 0){
    return false
  } else if(src.indexOf('quorum-config.json') >= 0){
    return false
  } else if(src.indexOf('quorum-genesis.json') >= 0){
    return false
  } else {
    return true
  }
}
