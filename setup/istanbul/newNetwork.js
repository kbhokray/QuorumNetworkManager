let async = require('async')
let exec = require('child_process').exec

let whisper = require('../../whisper/whisper')
let utils = require('../../utils')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../../config').ports
let setup = require('../../config').setup

const {
  FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH,
  FILE_BLOCKCHAIN_GETHIPC,
  FOLDER_CONSTELLATION, FILE_CONSTELLATION_CONFIG,
  FILE_CONSTELLATION_PUBKEY, FILE_CONSTELLATION_PRIVKEY, 
  FILE_CONSTELLATION_ARCHPUBKEY, FILE_CONSTELLATION_ARCHPRIVKEY, 
  BLOCKCHAIN_RPCPROVIDER_LOCALHOST, BLOCKCHAIN_WSPROVIDER_LOCALHOST,
  CONSENSUS, SCRIPT_BLOCKCHAIN_STARTISTANBULNODE
} = require('../../constants')

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

let startNewIstanbulNetwork = (config, cb) => {
  console.log('[*] Starting new node...')

  let nodeConfig = {
    localIpAddress: config.localIpAddress,
    networkMembership: config.networkMembership,
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
      remoteIpAddress: null,
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
    utils.handleExistingFiles,
    whisper.startCommunicationNetwork,
    utils.setupNetworkConfiguration,
    startIstanbulNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEtherResponseHandler,
    fundingHandler.monitorAccountBalances,
    whisper.existingIstanbulNetworkMembership,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, (err, res) => {
    if (err) { return console.log('ERROR:', err) }
    console.log('[*] Done')
    cb(err, res)
  })
}
let startNewNetwork = (options, cb) => {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.networkMembership = options.networkMembership
  config.keepExistingFiles = options.keepExistingFiles
  startNewIstanbulNetwork(config, (err, result) => {
    if (err) { return console.log('ERROR:', err) }
    config.istanbulNetwork = Object.assign({}, result)
    let networks = {
      istanbulNetwork: config.istanbulNetwork,
      communicationNetwork: config.communicationNetwork
    }
    cb(err, networks)
  })
}

exports.startNewNetwork = startNewNetwork