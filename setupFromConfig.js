let config = require('./config')
let setup = config.setup
let newRaftNetwork = require('./setup/raft/newNetwork')
let joinExistingRaft = require('./setup/raft/joinExistingNetwork')
let newIstanbulNetwork = require('./setup/istanbul/newNetwork')
let joinExistingIstanbul = require('./setup/istanbul/joinExistingNetwork')
const { CONSENSUS, NODE_ROLE } = require('./constants');

run = () => {
  console.log('[SetupFromConfig] Starting setup from config')
  console.log('==== Setup config ====')
  console.log('[IP]', setup.localIpAddress)
  console.log('[NODE_NAME]', config.identity.nodeName)
  console.log('[COORDINATING_IP]', setup.remoteIpAddress)
  console.log('[CONSENSUS]', setup.consensus)
  console.log('[ROLE]', setup.role)
  console.log('[KEEP_FILES]', setup.keepExistingFiles)
  console.log('[DELETE_KEYS]', setup.deleteKeys)
  console.log('==== Setup config ====')

  switch (config.setup.consensus) {
    case CONSENSUS.RAFT:
      setupRaft();
      break;
    case CONSENSUS.ISTANBUL:
      setupIstanbul();
      break;
    default:
      console.log('Only raft and istanbul are supported')
  }
}

let setupRaft = () => {
  switch (config.setup.role) {
    case NODE_ROLE.COORDINATOR:
      config.setup.automatedSetup = true
      newRaftNetwork.startNewNetwork(config.setup, (err, result) => {
        if (err) { console.log('ERROR:', err) }
        console.log('[SetupFromConfig] All done. Leave this running, ideally inside screen')
      })
      break;
    case NODE_ROLE.NONCOORDINATOR:
      console.log('TODO: non-coordinator')
      break;
    case NODE_ROLE.DYNAMIC_PEER:
      config.setup.automatedSetup = true
      joinExistingRaft.handleJoiningRaftNetwork(config.setup, function (err, result) {
        if (err) { console.log('ERROR:', err) }
        console.log('[SetupFromConfig] All done. Leave this running, ideally inside screen')
      })
      break;
    default:
      console.log('Unsupported option:', config.setup.role)
  }
}

let setupIstanbul = () => {
  switch (config.setup.role) {
    case NODE_ROLE.COORDINATOR:
      config.setup.automatedSetup = true
      newIstanbulNetwork.startNewNetwork(config.setup, (err, result) => {
        if (err) { console.log('ERROR:', err) }
        console.log('[SetupFromConfig] All done. Leave this running, ideally inside screen')
      })
      break;
    case NODE_ROLE.DYNAMIC_PEER:
      config.setup.automatedSetup = true
      joinExistingIstanbul.handleJoiningExistingIstanbulNetwork(config.setup, (err, result) => {
        if (err) { console.log('ERROR:', err) }
        console.log('[SetupFromConfig] All done. Leave this running, ideally inside screen')
      })
      break;
    default:
      console.log('Unsupported option:', config.setup.role)
  }
}

run()