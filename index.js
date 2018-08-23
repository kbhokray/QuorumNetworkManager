var prompt = require('prompt')

var utils = require('./utils')
var newIstanbulNetwork = require('./setup/istanbul/newNetwork')
var joinIstanbulNetwork = require('./setup/istanbul/joinExistingNetwork')
var newRaftNetwork = require('./setup/raft/newNetwork')
var joinRaftNetwork = require('./setup/raft/joinRaftNetwork')
var joinExistingRaftNetwork = require('./setup/raft/joinExistingNetwork')
var config = require('./config')
const { NETWORKMEMBERSHIP, CONSENSUS } = require('./constants');

prompt.start();
// TODO: These global vars should be refactored
var raftNetwork = null
var istanbulNetwork = null
var communicationNetwork = null
var localIpAddress = null
var remoteIpAddress = null
var checkForOtherProcesses = false

var consensus = null //RAFT or IBFT

let handleConsensusChoice = () => {
  console.log('Please select an option:\n1) Raft\n2) Istanbul BFT \n5) Kill all geth and constellation')
  prompt.get(['option'], (err, answer) => {
    if (answer.option === '1') {
      consensus = CONSENSUS.RAFT
      mainLoop()
    } else if (answer.option === '2') {
      consensus = CONSENSUS.ISTANBUL
      mainLoop()
    } else if (answer.option === '5') {
      utils.killallGethConstellationNode((err, result) => {
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

let getNetworkMembershipPolicy = (cb) => {
  console.log('Please select an option below:');
  console.log('1) Allow anyone to connect');
  console.log('2) Enable using permissioned-nodes');
  console.log('3) [TODO] Allow only people with pre-auth tokens to connect');
  prompt.get(['option'], (err, result) => {
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
        networkMembership: NETWORKMEMBERSHIP.ALLOWALL
      })
    }
  })
}

let keepExistingFiles = (cb) => {
  console.log('Please select an option below:');
  console.log('1) Clear all files/configuration and start from scratch[WARNING: this clears everything]')
  console.log('2) Keep old files/configuration intact and start the node + whisper services')
  console.log('3) [TODO] Keep enode and accounts, clear all other files/configuration')
  prompt.get(['option'], (err, result) => {
    if (result.option === '1') {
      cb({
        keepExistingFiles: false
      })
    } else if (result.option === '2') {
      cb({
        keepExistingFiles: true
      })
    } else {
      keepExistingFiles((res) => {
        cb(res)
      })
    }
  })
}

let handleRaftConsensus = () => {
  console.log('Please select an option below:');
  console.log('----- Option 1 and 2 are for the initial setup of a raft network -----')
  console.log('1) Start a node as the setup coordinator [Ideally there should only be one coordinator]')
  console.log('2) Start a node as a non-coordinator')
  console.log('----- Option 3 is for joining a raft network post initial setup  -----')
  console.log('3) Join a raft network if you were not part of the initial setup')
  console.log('4) TODO: Start whisper services and attach to already running node')
  console.log('5) Kill all geth constellation-node');
  console.log('0) Quit');
  prompt.get(['option'], (err, result) => {
    if (result.option === '1') {
      getNetworkMembershipPolicy((res) => {
        keepExistingFiles((setup) => {
          let options = {
            localIpAddress: localIpAddress,
            networkMembership: res.networkMembership,
            keepExistingFiles: setup.keepExistingFiles
          };
          newRaftNetwork.startNewNetwork(options, (err, networks) => {
            raftNetwork = networks.raftNetwork
            communicationNetwork = networks.communicationNetwork
            mainLoop()
          })
        })
      })
    } else if (result.option === '2') {
      keepExistingFiles((setup) => {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinRaftNetwork.handleJoiningRaftNetwork(options, (err, networks) => {
          raftNetwork = networks.raftNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option === '3') {
      keepExistingFiles((setup) => {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinExistingRaftNetwork.handleJoiningRaftNetwork(options, (err, networks) => {
          raftNetwork = networks.raftNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option === '4') {
      console.log('This is stil on the TODO list')
      mainLoop()
    } else if (result.option == 5) {
      utils.killallGethConstellationNode((err, result) => {
        if (err) { return onErr(err) }
        raftNetwork = null
        communicationNetwork = null
        mainLoop()
      })
    } else if (result.option === '0') {
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
  prompt.get(['option'], (err, result) => {
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
      keepExistingFiles((setup) => {
        let options = {
          localIpAddress: localIpAddress,
          keepExistingFiles: setup.keepExistingFiles
        };
        joinIstanbulNetwork.handleJoiningExistingIstanbulNetwork(options, (err, networks) => {
          istanbulNetwork = networks.istanbulNetwork
          communicationNetwork = networks.communicationNetwork
          mainLoop()
        })
      })
    } else if (result.option == 5) {
      utils.killallGethConstellationNode((err, result) => {
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

let mainLoop = () => {
  if (localIpAddress && checkForOtherProcesses === false) {
    utils.checkPreviousCleanExit((err, done) => {
      if (err) { console.log('ERROR:', err) }
      checkForOtherProcesses = done
      mainLoop()
    })
  } else if (localIpAddress && checkForOtherProcesses && consensus === CONSENSUS.RAFT) {
    handleRaftConsensus()
  } else if (localIpAddress && checkForOtherProcesses && consensus === CONSENSUS.ISTANBUL) {
    handleIstanbulConsensus()
  } else if (localIpAddress && checkForOtherProcesses && consensus == null) {
    handleConsensusChoice()
  } else {
    console.log('Trying to get public ip address, please wait a few seconds...')
    utils.whatIsMyIp((ip) => {
      console.log('Welcome! \n\n'
        + 'Please enter the IP address other nodes will use to connect to this node. \n\n'
        + 'Also, please enter a publicly identifyable string for this node to use.\n\n')
      let schema = [{
        name: 'localIpAddress',
        default: ip.publicIp
      }, {
        name: 'nodeName' // TODO: Add schema to remove unwanted characters etc.
      }]
      prompt.get(schema, (err, answer) => {
        localIpAddress = answer.localIpAddress
        config.identity.nodeName = answer.nodeName
        mainLoop()
      })
    })
  }
}

let onErr = (err) => {
  console.log(err);
  return 1;
}

mainLoop();
