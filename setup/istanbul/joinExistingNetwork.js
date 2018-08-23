let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('../../whisper/whisper')
let utils = require('../../utils')
let constellation = require('../../constellation/constellation')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../../config').ports
let setup = require('../../config').setup

const {
  FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH,
  FOLDER_CONSTELLATION, FILE_CONSTELLATION_PUBKEY,
  FILE_CONSTELLATION_PRIVKEY, FILE_CONSTELLATION_ARCHPUBKEY,
  FILE_CONSTELLATION_ARCHPRIVKEY, FILE_BLOCKCHAIN_GETHIPC,
  BLOCKCHAIN_RPCPROVIDER_LOCALHOST, BLOCKCHAIN_WSPROVIDER_LOCALHOST,
  CONSENSUS,
  SCRIPT_BLOCKCHAIN_STARTISTANBULNODE, FILE_CONSTELLATION_CONFIG
} = require('../../constants');

prompt.start()

let startIstanbulNode = (result, cb) => {
  console.log('[*] Starting istanbul node...')
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = `./${SCRIPT_BLOCKCHAIN_STARTISTANBULNODE}`
  cmd += ' ' + setup.targetGasLimit
  cmd += ' ' + ports.gethNode
  cmd += ' ' + ports.gethNodeRpc
  cmd += ' ' + ports.gethNodeWsRpc
  let child = exec(cmd, options)
  child.stdout.on('data', (data) => {
    cb(null, result)
  })
  child.stderr.on('data', (error) => {
    console.log('Start istanbul node ERROR:', error)
    cb(error, null)
  })
}

let handleExistingFiles = (result, cb) => {
  if (result.keepExistingFiles === false) {
    let seqFunction = async.seq(
      utils.clearDirectories,
      utils.createDirectories,
      utils.getNewGethAccount,
      utils.generateEnode,
      utils.displayEnode,
      constellation.createNewKeys,
      constellation.createConfig
    )
    seqFunction(result, (err, res) => {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

let handleNetworkConfiguration = (result, cb) => {
  if (result.keepExistingFiles === false) {
    let seqFunction = async.seq(
      whisper.requestExistingIstanbulNetworkMembership,
      whisper.getGenesisBlockConfig,
      whisper.getStaticNodesFile
    )
    seqFunction(result, (err, res) => {
      if (err) { return console.log('ERROR:', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

let joinIstanbulNetwork = (config, cb) => {
  console.log('[*] Joining network...')

  let nodeConfig = {
    localIpAddress: config.localIpAddress,
    remoteIpAddress: config.remoteIpAddress,
    keepExistingFiles: config.keepExistingFiles,
    folders: [FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH, FOLDER_CONSTELLATION],
    constellationKeySetup: [
      { folderName: FOLDER_CONSTELLATION, fileName: 'node' },
      { folderName: FOLDER_CONSTELLATION, fileName: 'nodeArch' },
    ],
    constellationConfigSetup: {
      configName: FILE_CONSTELLATION_CONFIG,
      folderName: FOLDER_CONSTELLATION,
      localIpAddress: config.localIpAddress,
      localPort: ports.constellation,
      remoteIpAddress: config.remoteIpAddress,
      remotePort: ports.constellation,
      publicKeyFileName: FILE_CONSTELLATION_PUBKEY,
      privateKeyFileName: FILE_CONSTELLATION_PRIVKEY,
      publicArchKeyFileName: FILE_CONSTELLATION_ARCHPUBKEY,
      privateArchKeyFileName: FILE_CONSTELLATION_ARCHPRIVKEY,
    },
    web3IpcHost: `./${FILE_BLOCKCHAIN_GETHIPC}`,
    web3RpcProvider: BLOCKCHAIN_RPCPROVIDER_LOCALHOST + ports.gethNodeRpc,
    web3WsRpcProvider: BLOCKCHAIN_WSPROVIDER_LOCALHOST + ports.gethNodeWsRpc,
    consensus: CONSENSUS.ISTANBUL
  }

  let seqFunction = async.seq(
    handleExistingFiles,
    whisper.joinCommunicationNetwork,
    handleNetworkConfiguration,
    startIstanbulNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEnodeRequestHandler,
    fundingHandler.monitorAccountBalances,
    whisper.existingIstanbulNetworkMembership,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, (err, res) => {
    if (err) { return console.log('ERROR', err) }
    console.log('[*] New network started')
    cb(err, res)
  })
}

let getRemoteIpAddress = (cb) => {
  if (setup.automatedSetup === true) {
    cb(setup.remoteIpAddress)
  } else {
    console.log('In order to join the network, please enter the ip address of the coordinating node')
    prompt.get(['ipAddress'], (err, network) => {
      cb(network.ipAddress)
    })
  }
}

let handleJoiningExistingIstanbulNetwork = (options, cb) => {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  getRemoteIpAddress((remoteIpAddress) => {
    config.remoteIpAddress = remoteIpAddress
    joinIstanbulNetwork(config, (err, result) => {
      if (err) { return console.log('ERROR:', err) }
      let networks = {
        raftNetwork: Object.assign({}, result),
        communicationNetwork: config.communicationNetwork
      }
      cb(err, networks)
    })
  })
}

exports.handleJoiningExistingIstanbulNetwork = handleJoiningExistingIstanbulNetwork