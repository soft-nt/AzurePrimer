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

function sleep(ms) {
    var deferred = Q.defer();

    var schedule = setInterval(function() {
        clearInterval(schedule);
        deferred.resolve();
    }, ms);

    return deferred.promise;
}

function checkUrlProvisioningReady(url) {
    var deferred = Q.defer();

    http.get(url, function(response) {
        var body = '';

        response.on('data', function(data) {
            body += data;
        });

        response.on('end', function() {
            if (body.indexOf('Welcome to Express') > 0) {
                deferred.resolve({'url': url, 'ready': true});
            }
            else {
                deferred.resolve({'url': url, 'ready': false});
            }
        });
    }).on('error', function(e) {
        deferred.reject(e);
    });

    return deferred.promise;
}

function waitingServices(resourceName){
    var deferred = Q.defer();

    console.info('-- Waiting services provisioning --');

    var schedule = setInterval(function() {
        var cmd = 'azure group log show ' + resourceName + ' --json';
    
        sexec(cmd, {maxBuffer: 1024 * 500}, function(error, stdout, stderr) {
            if (error) {
                console.error(error);
            }
            else
            {

                if (stdout != undefined && stdout != '') {
                    var result = JSON.parse(stdout);
                    var countSitesCreated = 0;
                    result.forEach(function(item) {
                        if (item.operationName.value == 'Microsoft.Web/sites/slots/write') {
                            if (item.properties.statusCode == "OK") {
                                countSitesCreated++;
                            };
                        };
                    });

                    console.log('... Slots created: ' + countSitesCreated);

                    if (countFinished >= 2) {
                        clearInterval(schedule);
                        deferred.resolve();
                    };
                };
            }
        });
    }, 5000);

    return deferred.promise;
}

function waitingSites(appName){
    console.info('-- Waiting sites provisioning --');

    var url = 'http://primer-'+appName + '.azurewebsites.net/';
    var stagingUrl = 'http://primer-'+appName+'-primer-'+appName+'-staging.azurewebsites.net/';
    var devUrl = 'http://primer-'+appName+'-primer-'+appName+'-dev.azurewebsites.net/';

    function getRemainingUrlsToCheck(toCheckUrls, alreadyCheckedUrls) {
        var results = [];

        toCheckUrls.forEach(function(value) {
            if (alreadyCheckedUrls.indexOf(value)<= 0) {
                results.push(checkUrlProvisioningReady(value));
            };
        });

        return results;
    }

    var toCheckUrls = [url, stagingUrl, devUrl];
    var alreadyCheckedUrls = [];

    var retry = true;
    return promiseWhile(function() {return retry;},function() {
        if (toCheckUrls.length == alreadyCheckedUrls.length) {
            retry = false;
        };

        return Q.allSettled(getRemainingUrlsToCheck(toCheckUrls, alreadyCheckedUrls))  
            .then(function (results) {
                console.log('...');

                results.forEach(function (result) {
                    if (result.state === 'fulfilled') {
                        if (result.value.ready) {
                            alreadyCheckedUrls.push(result.value.url);
                        };
                    } else {
                        // This item failed to be loaded :(
                        console.log('Failed to check the url: ' + result.reason);
                    }
               });
            }).delay(5000);
    });
}

function waitingDeploymentToFinish(resourceName, appName) {
    // waitingServices(resourceName)
    //     .then(function() {
    //         waitingSites(appName)
    //             .then(function() {
    //                 console.log('Deployment finished');
    //             });
    //     });
    //     
    
    waitingServices(resourceName)
        .then(function() {
            console.log('Resources deployment finished');
        });
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

// `condition` is a function that returns a boolean
// `body` is a function that returns a promise
// returns a promise for the completion of the loop
function promiseWhile(condition, body) {
    var done = Q.defer();

    function loop() {
        // When the result of calling `condition` is no longer true, we are
        // done.
        if (!condition()) return done.resolve();
        // Use `when`, in case `body` does not return a promise.
        // When it completes loop again otherwise, if it fails, reject the
        // done promise
        Q.when(body(), loop, done.reject);
    }

    // Start running the loop in the next tick so that this function is
    // completely async. It would be unexpected if `body` was called
    // synchronously the first time.
    Q.nextTick(loop);

    // The promise
    return done.promise;
}

var test = function (resourceName) {
    waitingServices(resourceName);
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

    //console.log('Params have been created'.green);
}

var createApp = function (name, repoUrl) {
    var resourceGroupName = cResourceGroupName + name;

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