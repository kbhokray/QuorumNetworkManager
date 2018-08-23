if [ -n "`$SHELL -c 'echo $ZSH_VERSION'`" ]; then
    # assume Zsh
    shell_profile="zshrc"
elif [ -n "`$SHELL -c 'echo $BASH_VERSION'`" ]; then
    # assume Bash
    shell_profile="bashrc"
fi

GO_BIN=$(which go)

if [[ $GO_BIN != "" ]]
then 
  sed -i '/# GoLang/d' "$HOME/.${shell_profile}"
  sed -i '/export GOROOT/d' "$HOME/.${shell_profile}"
  sed -i '/:$GOROOT/d' "$HOME/.${shell_profile}"
  sed -i '/export GOPATH/d' "$HOME/.${shell_profile}"
  sed -i '/:$GOPATH/d' "$HOME/.${shell_profile}"
  GO_BIN_FOLDER=${GO_BIN%/go}
  GO_FOLDER=${GO_BIN_FOLDER%/bin}
  GO_BIN_ESCAPED=${GO_BIN_FOLDER//\//\\/}
  sed -i "/:${GO_BIN_ESCAPED}/d" "$HOME/.${shell_profile}"
  sudo rm -rf $GO_FOLDER
fi

echo 'go removed'
exit
