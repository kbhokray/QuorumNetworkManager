const DELIMITER = "|";

const REQUEST = 'request';
const RESPONSE = 'response';

const ETHER = 'ether';
const ENODE = 'enode';
const GENESISCONFIG = 'genesisConfig';
const STATICNODES = 'staticNodes';

const NETWORKMEMBERSHIP = 'networkMembership';
const EXISTINGRAFTMEMBERSHIP = 'existingRaftNetworkMembership'
const EXISTINGINSTANBULMEMBERSHIP = 'existingIstanbulNetworkMembership';
const STATUS_MEMBERSHIP = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
}

let buildDelimitedString = (...args) => {
  let delimitedString = '';
  for (let argument of args) {
    /* if (argument.indexOf(DELIMITER) > -1) {
      console.log("ERROR: Message string contains " + DELIMITER + ", which is reserved for special use");
    } */
    delimitedString += argument + DELIMITER
  }

  return delimitedString.replace(/\|$/, "");
}

let appendData = (string, data) => {
  if (data.indexOf(DELIMITER) > -1) {
    console.log("ERROR: Message data contains " + DELIMITER + ", which is reserved for special use");
  }
  return string + data;
}

// TODO: this can be improved to take in some defaults for ttl and workToProve
// TODO: this can also perhaps have the option between an object with the parameters or 
// the individual parameters
function buildPostObject(topics, payload, ttl, workToProve, id) {
  postObj = {
    JSON: {
      'topics': topics,
      'payload': payload,
      'ttl': ttl,
      'workToProve': workToProve
    },
    filterObject: buildFilterObject(topics)
  };
  if (id != undefined) {
    postObj.JSON.from = id
  }
  return postObj;
}

function buildFilterObject(topics) {
  let hexTopics = []
  for (let topic of topics) {
    let hexString = '0x' + new Buffer(topic).toString('hex')
    hexString = hexString.substring(0, 10)
    hexTopics.push(hexString)
  }
  return { 'topics': hexTopics }
}

exports.REQUEST = {
  ETHER: buildDelimitedString(REQUEST, ETHER),
  ENODE: buildDelimitedString(REQUEST, ENODE),
  GENESISCONFIG: buildDelimitedString(REQUEST, GENESISCONFIG),
  STATICNODES: buildDelimitedString(REQUEST, STATICNODES),
  MEMBERSHIP: buildDelimitedString(REQUEST, NETWORKMEMBERSHIP),
  EXISTINGINSTANBULMEMBERSHIP: buildDelimitedString(REQUEST, EXISTINGINSTANBULMEMBERSHIP)
};

exports.RESPONSE = {
  ETHER: buildDelimitedString(RESPONSE, ETHER),
  ENODE: buildDelimitedString(RESPONSE, ENODE),
  GENESISCONFIG: buildDelimitedString(RESPONSE, GENESISCONFIG),
  STATICNODES: buildDelimitedString(RESPONSE, STATICNODES),
  NETWORKMEMBERSHIP: buildDelimitedString(RESPONSE, NETWORKMEMBERSHIP),
  EXISTINGRAFTMEMBERSHIPACCEPTED: buildDelimitedString(RESPONSE, EXISTINGRAFTMEMBERSHIP, STATUS_MEMBERSHIP.ACCEPTED),
  EXISTINGMEMBERSHIPACCEPTED: buildDelimitedString(RESPONSE, NETWORKMEMBERSHIP, STATUS_MEMBERSHIP.ACCEPTED),
  EXISTINGISTANBULMEMBERSHIPACCEPTED: buildDelimitedString(RESPONSE, EXISTINGINSTANBULMEMBERSHIP, STATUS_MEMBERSHIP.ACCEPTED)
};

let publish = {
  nodeInfo: buildDelimitedString('publish', 'nodeInfo')
}

exports.buildDelimitedString = buildDelimitedString;
exports.appendData = appendData;
exports.BuildPostObject = buildPostObject;
exports.BuildFilterObject = buildFilterObject;
exports.Publish = publish;
