// Include something if not logged

var program = require('commander');
var azure = require('azure-cli');
var exec = require('child-process-promise').exec;
var jsonfile = require('jsonfile');
var git = require("nodegit");

var resourceName = "LPSPrimerTest";
var location = "West US";


function createAzureResource(templateUrl) {
    var cmd = 'azure group create "' + resourceName + '" "' + location + '" -d Test -e params.json --template-uri ' + templateUrl;
    console.log('-- Creating the resource --');
    return exec(cmd);
};

function waitingDeploymentToFinish() {
    console.log('Waiting deployment to finish');
    var schedule = setInterval(function () {
        var cmd = 'azure group deployment show ' + resourceName;
        
        exec(cmd).then(function (result) {
            console.log('...');
            
            if (result.stdout.indexOf("ProvisioningState  : Succeeded") > 0) {
                clearInterval(schedule);
            }
        });
    }, 5000);
    
    return result;
};

function switchToArm() {
    console.log('-- Switching to arm mode --')
    return exec('azure config mode arm');
};

var test = function () {
    console.log('Getting the data');
    git.Clone('https://github.com/soft-nt/deployazurenode', 'tmp').then(function (repo) { 
          
    });
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
}

var createWebSite = function (name, repoUrl) {
    console.log('--- Creating a web site called ' + name + ' ---');
    
    switchToArm().then(function () {
        createParams(name, repoUrl);
        
        // Creating a resource based on web site template
        createAzureResource('https://raw.githubusercontent.com/soft-nt/AzurePrimer/master/ResourceTemplates/WebApp/WebApp.json').then(function (result) {
            console.log('Resource creation started');
            console.log('Result: ' + result.stdout);
            
            waitingDeploymentToFinish();
        }).fail(function (err) {
            if (err.indexOf("result is not defined") < 0) {
                console.error('ERROR: ', err);
            }
        });
    });
};


// Exported functions
exports.test = test;
exports.createWebSite = createWebSite;
exports.login = login;
exports.selectSubscription = selectSubscription;



// Creacting the commands
program
  .version('0.0.1')
  .command('createWebApp <name> <repoUrl>')
  .alias('cwa')
  .description('Create a web app using Azure Primer')
  .action(function (name, repoUrl) {
    createWebSite(name, repoUrl);
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
  .action(function () {
    test();
});

program.parse(process.argv);