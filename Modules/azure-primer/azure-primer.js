var program = require('commander');
var azure = require('azure-cli');
var prompt = require('prompt');
var exec = require('child_process').exec;
var jsonfile = require('jsonfile');

var resourceName = "LPSPrimerTest";
var location = "West US";

function createAzureResource(templateUrl) {
    var cmd = 'azure group create "' + resourceName + '" "' + location + '" -d Test -e params.json --template-uri ' + templateUrl;
    exec(cmd, function (error, stdout, stderr) {
        console.log(stdout);
    });
};

function isDeploymentFinished() {
    var result = false;
    
    var cmd = 'azure group deployment show ' + resourceName;
    exec(cmd, function (error, stdout, stderr) {
        if (stdout.indexOf("ProvisioningState  : Succeeded") > 0) {
            result = true;
        }
    });

    return result;
};

function switchToArm() {
    // Switching to arm
    exec('azure config mode arm', function (error, stdout, stderr) {
        console.log(stdout);
    });
}

var test = function () { 
    console.log('test ok');
}

var createWebSite = function (name) {
    console.log('Creating a web site called ' + name);
    
    switchToArm();

    // create the params to send
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
    
    // Creating a resource based on web site template
    createAzureResource('https://raw.githubusercontent.com/soft-nt/AzurePrimer/master/ResourceTemplates/WebApp/WebApp.json');

    // Check for the deployment status
    console.log(isDeploymentFinished());
    console.log(isDeploymentFinished());
    console.log(isDeploymentFinished());
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