var prompt = require('prompt')

var utils = require('./utils')
var newIstanbulNetwork = require('./istanbul/newNetwork')
var joinIstanbulNetwork = require('./istanbul/joinExistingNetwork')
var newRaftNetwork = require('./raft/newNetwork')
var joinRaftNetwork = require('./raft/joinRaftNetwork')
var joinExistingRaftNetwork = require('./raft/joinExistingNetwork')
var ipAddresses = require('./ipAddress')
var config = require('./config')
const { NETWORKMEMBERSHIP } = require('./constants');

prompt.start();
// TODO: These global vars should be refactored
var raftNetwork = null
var istanbulNetwork = null
var communicationNetwork = null
var localIpAddress = null
var remoteIpAddress = null
var checkForOtherProcesses = false

var consensus = null //RAFT or IBFT

function handleConsensusChoice() {
  console.log('Please select an option:\n1) Raft\n2) Istanbul BFT \n5) Kill all geth and constellation')
  prompt.get(['option'], function (err, answer) {
    if (answer.option == 1) {
      consensus = 'raft'
      mainLoop()
    } else if (answer.option == 2) {
      consensus = 'istanbul'
      mainLoop()
    } else if (answer.option == 5) {
      utils.killallGethConstellationNode(function (err, result) {
        if (err) { return onErr(err); }
        raftNetwork = null
        istanbulNetwork = null
        communicationNetwork = null;
        mainLoop()
      })
    } else {
      handleConsensusChoice()
    }
  })
}

function getNetworkMembershipPolicy(cb) {
  console.log('Please select an option below:');
  console.log('1) Allow anyone to connect');
  console.log('2) Enable using permissioned-nodes');
  console.log('3) [TODO] Allow only people with pre-auth tokens to connect');
  prompt.get(['option'], function (err, result) {
    if (result.option === '1') {
      cb({
        networkMembership: NETWORKMEMBERSHIP.ALLOWALL
      })
    } else if (result.option === '2') {
      cb({
        networkMembership: NETWORKMEMBERSHIP.PERMISSIONEDNODES
      })
    } else {
      console.log('This option is still TODO, defaulting to option 1');
      cb({
        //networkMembership: 'allowOnlyPreAuth'
        networkMembership: 'allowAll'
      })
    }
  })
}

function keepExistingFiles(cb) {
  console.log('Please select an option below:');
  console.log('1) Clear all files/configuration and start from scratch[WARNING: this clears everything]')
  console.log('2) Keep old files/configuration intact and start the node + whisper services')
  console.log('3) [TODO] Keep enode and accounts, clear all other files/configuration')
  prompt.get(['option'], function (err, result) {
    if (result.option === '1') {
      cb({
        keepExistingFiles: false
      })
    } else if (result.option === '2') {
      cb({
        keepExistingFiles: true
      })
    } else {
      keepExistingFiles(function (res) {
        cb(res)
      })
    }
  })
}

function handleRaftConsensus() {
  console.log('Please select an option below:');
  console.log('----- Option 1 and 2 are for the initial setup of a raft network -----')
  console.log('1) Start a node as the setup coordinator [Ideally there should only be one coordinator]')
  console.log('2) Start a node as a non-coordinator')
  console.log('----- Option 3 is for joining a raft network post initial setup  -----')
  console.log('3) Join a raft network if you were not part of the initial setup')
  console.log('4) TODO: Start whisper services and attach to already running node')
  console.log('5) Kill all geth constellation-node');
  console.log('0) Quit');
  prompt.get(['option'], function (err, result) {
    if (result.option == 1) {
      getNetworkMembershipPolicy(function (res) {
        keepExistingFiles(function (setup) {
          let options = {
            localIpAddress: localIpAddress,
            networkMembership: res.networkMembership,
            keepExistingFiles: setup.keepExistingFiles
          };
          newRaftNetwork.startNewNetwork(options, function (err, networks) {
            raftNetwork = networks.raftNetwork
            communicationNetwork = networks.communicationNetwork
            mainLoop()
          })
        })
      })
    } else if (result.option == 2) {
      keepExistingFiles(function (setup) {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinRaftNetwork.handleJoiningRaftNetwork(options, function (err, networks) {
          raftNetwork = networks.raftNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option == 3) {
      keepExistingFiles(function (setup) {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinExistingRaftNetwork.handleJoiningRaftNetwork(options, function (err, networks) {
          raftNetwork = networks.raftNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option == 4) {
      console.log('This is stil on the TODO list')
      mainLoop()
    } else if (result.option == 5) {
      utils.killallGethConstellationNode(function (err, result) {
        if (err) { return onErr(err) }
        raftNetwork = null
        communicationNetwork = null
        mainLoop()
      })
    } else if (result.option == 0) {
      console.log('Quiting')
      process.exit(0)
      return
    } else {
      mainLoop()
    }
  })
}

function handleIstanbulConsensus() {
  console.log('Please select an option below:');
  console.log('----- Option 1 and 2 are for the initial validator setup of a istanbul network -----')
  console.log('1) Start a node as the setup coordinator [Ideally there should only be one coordinator]')
  console.log('2) Start a node as a non-coordinator')
  console.log('5) Kill all geth constellation-node');
  console.log('0) Quit');
  prompt.get(['option'], function (err, result) {
    if (result.option == 1) {
      getNetworkMembershipPolicy(function (res) {
        keepExistingFiles(function (setup) {
          let options = {
            localIpAddress: localIpAddress,
            networkMembership: res.networkMembership,
            keepExistingFiles: setup.keepExistingFiles
          };
          newIstanbulNetwork.startNewNetwork(options, function (err, networks) {
            istanbulNetwork = networks.istanbulNetwork
            communicationNetwork = networks.communicationNetwork
            mainLoop()
          })
        })
      })
    } else if (result.option == 2) {
      keepExistingFiles(function (setup) {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinIstanbulNetwork.handleJoiningExistingIstanbulNetwork(options, function (err, networks) {
          istanbulNetwork = networks.istanbulNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option == 5) {
      utils.killallGethConstellationNode(function (err, result) {
        if (err) { return onErr(err) }
        raftNetwork = null
        communicationNetwork = null
        mainLoop()
      })
    } else if (result.option == 0) {
      console.log('Quiting')
      process.exit(0)
      return
    } else {
      mainLoop()
    }
  })
}

function mainLoop() {
  if (localIpAddress && checkForOtherProcesses == false) {
    utils.checkPreviousCleanExit(function (err, done) {
      if (err) { console.log('ERROR:', err) }
      checkForOtherProcesses = done
      mainLoop()
    })
  } else if (localIpAddress && checkForOtherProcesses && consensus === 'raft') {
    handleRaftConsensus()
  } else if (localIpAddress && checkForOtherProcesses && consensus === 'istanbul') {
    handleIstanbulConsensus()
  } else if (localIpAddress && checkForOtherProcesses && consensus == null) {
    handleConsensusChoice()
  } else {
    console.log('Trying to get public ip address, please wait a few seconds...')
    ipAddresses.whatIsMyIp(function (ip) {
      console.log('Welcome! \n\n'
        + 'Please enter the IP address other nodes will use to connect to this node. \n\n'
        + 'Also, please enter a publicly identifyable string for this node to use.\n\n')
      let schema = [{
        name: 'localIpAddress',
        default: ip.publicIp
      }, {
        name: 'nodeName' // TODO: Add schema to remove unwanted characters etc.
      }]
      prompt.get(schema, function (err, answer) {
        localIpAddress = answer.localIpAddress
        config.identity.nodeName = answer.nodeName
        mainLoop()
      })
    })
  }
}

function onErr(err) {
  console.log(err);
  return 1;
}

mainLoop();
