# Deployment Guide for CMR, DDS and Frontend

This guides assumes that a WSL distro is running (if not see wslsetupcommands.md) and has built the dev-system jar file

It is recommended that you use microsoft Terminal app to start and manage wsl sessions

## Deployment Summary

The deployment uses 4 separate services

1. CMR
- metadata catalog with advanced search capabilities

2. DDS
- handles the grid image scaling service for the frontend
- sends download link emails and hosts files for download

3. Reverse Proxy
- implements HTTPS
- routing for the CMR and DDS

4. Frontend
- also implements HTTPS
- serves static webpack files to clients

## Ports

Expose wsl ports to windows
Run as admin in powershell: 
`configure_ports.ps1`

## CMR (Common Metadata Repository)

### Running CMR

Open WSL terminal and navigate to cmr repo root directory 
`cd /home/george/cmr`

Verify no docker containers are running
`docker ps`
If this fails to run you will need to ensure docker is running and wsl docker integration is enabled for the distro
If the machine was shutdown for any reason hyper-v may be holding the ports
You can clear them with
`netcfg -d`
Reboot the machine and check for docker functionality again

Launch the CMR
`cmr start uberjar dev-system`

Wait for several seconds and you should see 4 running containers
`docker ps`

### Restarting/Shutdown

Open WSL terminal and navigate to cmr repo root directory (/home/george/cmr)

Command to stop the CMR (this will purge the database)
`cmr stop uberjar dev-system`

### Upload metadata

With a running CMR, run Intrepid's project manager

Navigate to the jetstream working directory `cd /home/george/cmr`

If the intrepid catalog needs updating (new/deleted datasets) run the appropriate acquire catalog taskfile
Run the appropriate cat2cmr taskfile to start the ingest of metadata
Beware! cat2cmr can be configured to overwrite all metadata. Ensure the task file's settings reflect your intentions

## DDS

### Config DDS

Open WSL terminal and navigate to cmr DDS directory

`cd /home/george/cmr/browse-scaler/src`

Check the settings in secret-config.js are valid
If the config file is missing create a new one

`cp /home/george/cmr/browse-scaler/src/secret-config-example.js /home/george/cmr/browse-scaler/src/secret-config.js`

- SMTP - email settings for noreply email accoumt
- secret_key - can be anything just unique
- USE_HTTPS - set to false
- private,cert,ca - not needed
- PORT - port of DDS server should be 8082
- PROXYSERVER - url of reverse proxy server
- DATA_DIR - location of jetstream data directory

### Run DDS

Open WSL terminal and navigate to cmr DDS directory 

`cd /home/george/cmr/browse-scaler/src`

Start the DDS
`npm run prod`

## Reverse Proxy

### Config Proxy

Open WSL terminal and navigate to cmr proxy directory `cd /home/george/cmr/proxy`

Check the settings in secret-config.js are valid

- USE_HTTPS - set to true
- private,cert,ca - point to the domain certificates
- PORT - port of proxy server should be 8081

### Start Server

Open WSL terminal and navigate to cmr proxy directory `cd /home/george/cmr/proxy`

Start the proxy server
`npm run prod`

## Frontend Search Portal

### Config Frontend

Open WSL terminal and navigate to earthdata-search directory `cd /home/george/earthdata-search`

Check the settings in overrideStatic.config.json are valid

- "application": { "defaultPortal": - portal config name (one of /home/george/earthdata-search/portals)
- "earthdata": { "prod": { "cmrHost": - url of reverse proxy server

Build the static files `npm run build`
If there are any errors the static files will not be generated

Navigate to the server project directory `cd /home/george/earthdata-search/server`

Check the settings in secret-config.js are valid

- USE_HTTPS - set to true
- private,cert,ca - point to the domain certificates
- PORT - port of frontend server should be 8080

### Start Server

Open WSL terminal and navigate to earthdata-search directory `cd /home/george/earthdata-search/server`

Start the proxy server
`npm run prod`