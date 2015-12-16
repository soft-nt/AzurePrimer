// Include something if not logged

var program = require('commander');
var azure = require('azure-cli');
var prompt = require('prompt');
var exec = require('child-process-promise').exec;
var jsonfile = require('jsonfile');

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
}

var test = function () { 
    console.log('test ok');
}

function createParams(name) {
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
                "value": "https://github.com/soft-nt/deployazurenode"
            },
            "workerSize": {
                "value": "0"
            }
        }
    }
    
    jsonfile.writeFile(file, obj, function (err) { });
}

var createWebSite = function (name) {
    console.log('--- Creating a web site called ' + name + ' ---');
    
    switchToArm().then(function () {
        createParams(name);

        // Creating a resource based on web site template
        createAzureResource('https://raw.githubusercontent.com/soft-nt/AzurePrimer/master/ResourceTemplates/WebApp/WebApp.json').then(function (result) {
            console.log('Resource creation started');
            console.log('Result: ' + result.stdout);

            waitingDeploymentToFinish();
        });
    });
};

// Exported functions
exports.test = test;
exports.createWebSite = createWebSite;

// Creacting the commands
program
  .version('0.0.1')
  .command('createWebApp <name>')
  .alias('cwa')
  .description('Create a web app on using Azure Primer')
  .action(function (name) {
    createWebSite(name);
});

program.parse(process.argv);