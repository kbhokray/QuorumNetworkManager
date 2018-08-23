#!/bin/bash
# Removing legacy (v0.0.1) constellation-enclave-keygen
CONSTELLATION_ENCLAVE_BIN_PATH="$(which constellation-enclave-keygen)"
[ -e $CONSTELLATION_ENCLAVE_BIN_PATH ] && rm -f $CONSTELLATION_ENCLAVE_BIN_PATH

# Remove constellation from bashrc
CONSTELLATION_BIN_PATH="$(which constellation-node)"
if [[ $CONSTELLATION_BIN_PATH != "" ]]
then
  CONSTELLATION_BIN_DIR="$(dirname $CONSTELLATION_BIN_PATH)"
  REMOVE_FROM_BASHRC="/PATH=\\\$PATH:$(echo $CONSTELLATION_BIN_DIR | sed -e 's/\\/\\\\/g; s/\//\\\//g; s/&/\\\&/g')/d"
  sed -i $REMOVE_FROM_BASHRC ~/.bashrc
fi

# Remove constellation-node binaries
[ -e $CONSTELLATION_BIN_PATH ] && rm -f $CONSTELLATION_BIN_PATH
[ -e $CONSTELLATION_BIN_DIR ] && rm -rf $CONSTELLATION_BIN_DIR
echo "Removed constellation binaries and bashrc entries."
