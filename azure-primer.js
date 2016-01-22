// Include something if not logged

var program = require('commander');
var azure = require('azure-cli');
var exec = require('child-process-promise').exec;
var sexec = require('child_process').exec;
var jsonfile = require('jsonfile');
var fse = require('fs-extra');
var github = require('octonode');
var colors = require('colors');
var http = require('http');
var Q = require('q');

var location = "West US";
var cResourceGroupName = 'LPSDelivery-APrimerTest-';


function createAzureResource(templateUrl, resourceName) {
    var cmd = 'azure group create "' + resourceName + '" "' + location + '" -d Test -e params.json --template-uri ' + templateUrl;
    console.log('-- Creating the resource --');
    return exec(cmd);
};

function checkUrlProvisioningReady(url) {
    var deferred = Q.defer();

    http.get(url, function(response) {
        var body = '';

        response.on('data', function(data) {
            body += data;
        });

        response.on('end', function() {
            if (body.indexOf('Express Primer') > 0) {
                deferred.resolve();
            }
            else {
                deferred.reject(new Error('Express not yet provisionned')));
            }
        });
    }).on('error', function(e) {
        deferred.reject(e);
    });

    return deferred.promise;
}

function waitingDeploymentToFinish(resourceName, appName) {
    var step = 'waitingServices';
    var state = 0;
    var callState = 0;

    // Waiting the resources to be created
    var schedule = setInterval(function () {
        switch (step) {
            case 'waitingServices':
                console.info('Waiting services provisioning ...');

                var cmd = 'azure group log show ' + resourceName + ' --json';
                
                sexec(cmd, function(error, stdout, stderr) {
                    if (error) {
                        console.error(error.red)
                    }
                    else
                    {
                        if (stdout != undefined && stdout != '') {
                            var result = JSON.parse(stdout);
                            var deploySucceeded = result[0].status.value == 'Succeeded' ? true : false;
                            if (deploySucceeded) {
                                step = 'waitingSite';
                                console.info('Moving to the next step');
                            };
                        };
                    }
                });
                break;
            case 'waitingSite':
                var url = 'http://primer-'+appName + '.azurewebsites.net/';
                var stagingUrl = 'http://primer-'+appName+'-primer-'+appName+'-staging.azurewebsites.net/';
                var devUrl = 'http://primer-'+appName+'-primer-'+appName+'-dev.azurewebsites.net/';
        
                console.info('Waiting sites to be provisionned');

                if ((state & 1) == 0) {
                    checkUrlProvisioningReady(url).then(function() {
                        state = state | 1;
                        console.log('Live available: %s'.green, url);
                    });
                }

                if ((state & 2) == 0) {
                    checkUrlProvisioningReady(stagingUrl).then(function(r) {
                        if (r) {
                            state = state | 2;
                            console.log('Staging available: %s'.green, stagingUrl);
                        };
                    });
                };
            
                if ((state & 4) == 0) {
                    checkUrlProvisioningReady(devUrl).then(function() {
                        state = state | 4;
                        console.log('Dev available: %s'.green, devUrl);
                    });
                };

                console.log('state: ' + state);

                if (state == 7) {
                    step = 'completed';
                    console.log('Moving to the completed step');
                };

                break;
            case 'completed':
                clearInterval(schedule);
                break;
        }
    }, 10000);
};


function switchToArm() {
    console.log('-- Switching to arm mode --')
    return exec('azure config mode arm');
};

function createGithubRepo(userName, password, repoName) {
    var client = github.client({
        username: userName,
        password: password
    }, null);

    client.repo({
        "name" : repoName,
        "description": "This is your first repo",
    });
}

function cloneRepo(repoUrl, name, githubUserName, githubPassword)
{
    var sFolder = name;
    var tFolder = name + 'New';

    // Cleaning existing folders
    console.info('Cleaning the temp folders');
    fse.remove(sFolder)
        .then(function() {
            console.log('Folder %s deleted', sFolder);
            fse.remove(tFolder).then(function() {
                console.log('Folder %s deleted', tFolder);

                console.log('Cloning Git repo ' + repoUrl + ' on the folder ' + sFolder);
                git.Clone(repoUrl, sFolder).then(function(repo) {
                    console.log('Copying the file in the target folder %s', tFolder);
                    
                    // Create the new repo
                    fse.copy(sFolder, tFolder).then(function() {
                        console.log('Removing the .git folder');
                        fse.remove(tFolder + '/.git').then(function() {
                            console.log('.git folder removed');
                            var repoName = 'AzurePrimer-' + name;
                            createGithubRepo(githubUserName, githubPassword, name);
                        });
                    });

                });
            });
        });
}

var test = function (resourceName) {
};



var login = function (userName, password) {
    var cmd = 'azure login -u ' + userName + ' -p ' + password;
    
    return exec(cmd);
};

var selectSubscription = function (name) {
    var cmd = 'azure account set "' + name + '"';
    
    return exec(cmd);
};

function createParams(name, repoUrl) {
    var file = 'params.json';
    var obj = {
        "$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "siteName": {
                "value": name
            },
            "siteLocation": {
                "value": "West US"
            },
            "sku": {
                "value": "Standard"
            },
            "repoURL": {
                "value": repoUrl
            },
            "workerSize": {
                "value": "0"
            }
        }
    }
    
    jsonfile.writeFile(file, obj, function (err) { });

    console.log('Params have been created'.green);
}

var createApp = function (name, repoUrl) {
    var resourceGroupName = cResourceGroupName + name;

    console.log('--- Creating an app called ' + name + ' ---');
    
    switchToArm().then(function () {
        createParams(name, repoUrl);
        
        // Creating a resource based on web site template
        createAzureResource('https://raw.githubusercontent.com/soft-nt/AzurePrimer/master/ResourceTemplates/WebApp/WebApp.json', resourceGroupName).then(function (result) {
            console.log('Resource creation started');
            console.log('Result: ' + result.stdout);

            console.log();
            console.log('---- CREATION SUMMARY ----'.green);
            console.log('Resource group: %s'.green, resourceGroupName);
            console.log('Git repo: %s'.green, repoUrl);
            console.log();
            console.log('App Urls: http://primer-%s.azurewebsites.net'.green, name.toLowerCase());
            console.log();

            waitingDeploymentToFinish(resourceGroupName, name);

        }).fail(function (err) {
            console.error(err.stderr.red);
        });
    });
};

var createAppFromTemplate = function(name, projectType){
    switch (projectType) {
        case 'ExpressJs':
            createApp(name, 'https://github.com/soft-nt/AzurePrimer-ExpressJSTemplate');
            break;
        case 'ASP-MVC':
            console.log('ASP-MVC project type is not implemented yet');
            break;
        case 'PHP':
            console.log('PHP project type is not implemented yet');
            break;
        default:
            console.log('Project type %s is not known'.red, projectType);
    }
}


// Exported functions
exports.test = test;
exports.createApp = createApp;
exports.createAppFromTemplate = createAppFromTemplate;
exports.login = login;
exports.selectSubscription = selectSubscription;



// Creacting the commands
program
  .version('0.0.1')
  .command('createApp <name> <repoUrl>')
  .alias('ca')
  .description('Create an app using Azure Primer')
  .action(function (name, repoUrl) {
    createApp(name, repoUrl);
});

program
  .version('0.0.1')
  .command('createAppFromTemplate <name> <projectType>')
  .alias('caft')
  .description('Create an app using Azure Primer template')
  .action(function (name, projectType) {
    createAppFromTemplate(name, projectType);
});

program
  .version('0.0.1')
  .command('login <userName> <password>')
  .description('Login on azure')
  .action(function (userName, password) {
    login(userName, password).then(function (result) { 
        console.log(result.stdout);
    }).fail(function (err) { 
        console.log(err);
    });
});

program
  .version('0.0.1')
  .command('selectSubscription <name>')
  .description('Select subscription on azure')
  .action(function (name) {
    selectSubscription(name).then(function (result) {
        console.log(result.stdout);
    }).fail(function (err) {
        console.log(err);
    });
});

program
  .version('0.0.1')
  .command('test')
  .description('Test')
  .action(function (resourceName) {
    test(resourceName);
});

program.parse(process.argv);