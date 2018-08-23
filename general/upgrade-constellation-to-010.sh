#!/bin/bash
# Removing legacy (v0.0.1) constellation-enclave-keygen
CONSTELLATION_ENCLAVE_BIN_PATH="$(which constellation-enclave-keygen)"
[ -e $CONSTELLATION_ENCLAVE_BIN_PATH ] && rm -f $CONSTELLATION_ENCLAVE_BIN_PATH
# Remove constellation-node binaries
CONSTELLATION_BIN_PATH="$(which constellation-node)"
[ -e $CONSTELLATION_BIN_PATH ] && rm -f $CONSTELLATION_BIN_PATH
# Remove constellation from bashrc
CONSTELLATION_BIN_DIR="$(dirname $CONSTELLATION_BIN_PATH)"
REMOVE_FROM_BASHRC="/PATH=\\\$PATH:$(echo $CONSTELLATION_BIN_DIR | sed -e 's/\\/\\\\/g; s/\//\\\//g; s/&/\\\&/g')/d"
sed -i $REMOVE_FROM_BASHRC ~/.bashrc
echo "Removed v0.0.1 constellation binaries and bashrc entries."

# Installing new constellation binary
cd $CONSTELLATION_BIN_DIR
cd ..
sudo apt-get install -y unzip libdb-dev libleveldb-dev libsodium-dev zlib1g-dev libtinfo-dev
wget https://github.com/jpmorganchase/constellation/releases/download/v0.1.0/constellation-0.1.0-ubuntu1604.tar.xz -O constellation-0.1.0-ubuntu1604.tar.xz
tar -xf constellation-0.1.0-ubuntu1604.tar.xz
chmod +x constellation-0.1.0-ubuntu1604/constellation-node
echo "PATH=\$PATH:"$PWD/constellation-0.1.0-ubuntu1604 >> ~/.bashrc
source ~/.bashrc
export PATH=$PWD/constellation-0.1.0-ubuntu1604:$PATH

echo "Installed v0.1.0 constellation binary and bashrc entry."
