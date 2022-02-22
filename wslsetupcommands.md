# Steps to setup and run CMR dev-system in WSL ubuntu 20.04

## Development Envrionment
- Windows 10
- Wsl 2 
- Visual code with remote development extension
- Docker Desktop ( with WSL2 support enabled for distro)

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
cmr start repl

-launch CMR
(reset)

## Troubleshooting

### Docker containers wont start when running (reset) command
- To free ports if been held by hypervisor
netcfg -d 


