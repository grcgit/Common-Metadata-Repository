# Steps to setup and run CMR dev-system in WSL ubuntu 20.04

## Development Envrionment
- Windows 10
- Wsl 2 
- Visual code with remote development extension
- Docker Desktop with WSL2 support enabled for distro

## WSL Distro Prerequisites
### Java 8
sudo apt update
sudo apt install openjdk-8-jdk
java -version

### Lein
https://leiningen.org/
- make lein script somewhere on path e.g. "/usr/bin"
sudo nano lein
sudo chmod 777 lein
lein

### Ruby
sudo apt install ruby-full
ruby --version

### Maven
sudo apt-get install maven

### GCC
sudo apt install build-essential
gcc --version

## Running CMR
- Add cmr to path
echo "export PATH=\$PATH:`pwd`/bin" >> ~/.profile
echo "source `pwd`/resources/shell/cmr-bash-autocomplete" >> ~/.profile

- Relaunch wsl to update path

- Add oracle jars to oracle-lib/support
cmr install oracle-libs

- Make new profiles.clj
cmr setup profile
- replace passwords
cmr setup dev

### REPL
- Launch CMR
cmr start repl
(reset)

- Stop CMR
(stop)
(exit)

### JAR
- Launch CMR
cmr build uberjars
cmr build all
cmr start uberjar dev-system

- Stop CMR
cmr stop uberjar dev-system

## Start Local Image Scaler (depends on CMR redis service)
- from repo_root/browse-scaler/src
node index.js

## Troubleshooting

### Docker containers wont start when running (reset) command
- To free ports if been held by hypervisor
netcfg -d 

## Exporting and Importing WSL images onto another machine

### Export to tar image
wsl --list
wsl --export <WSL Image Name> <Export file>
eg. wsl --export ubuntu2004 ubuntu2004.tar

### Import to wsl distro
wsl –import <Image Name you choose> <Directory to store and run the image> <Directory location of the exported .tar file>
eg. wsl –import ubuntu2004 c:\ubuntu2004 ubuntu2004.tar

### Set Default User
create /etc/wsl.conf with following contents
[user]
default=username

### Port Proxies to wsl instance
setup ports 3003,8081,8080,80,443
netsh interface portproxy add v4tov4 listenport=3003 listenaddress=0.0.0.0 connectport=3003 connectaddress=172.1.1.1

