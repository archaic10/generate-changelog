const { Octokit } = require("@octokit/core")
const github = require('@actions/github')
const core = require('@actions/core')
const { exec } = require('@actions/exec')
const base64 = require('base-64')
const axios = require('axios')
const fs = require('fs')
const githubToken = core.getInput('github-token')
const octokit = new Octokit({ auth: githubToken})
var path = core.getInput('path')

let param = {
    owner: github.context.payload.repository.owner.name,
    repo: github.context.payload.repository.name
}

async function run(){
    if(githubToken){
        let newVersion = await getTag()
            if(newVersion){
                await setVersion(newVersion)
                await generateChangelog()
                let fileRead = fs.readFileSync(`./CHANGELOG.md`, 'utf8').toString()
                let fileBase64 = base64.encode(fileRead)
                path = 'CHANGELOG.md'
                let content = await getContent()
                let sha = content != 404 ? content.data.sha : null
                uploadGithub(fileBase64, `CHANGELOG.md`, sha)
            }
    }else{
        core.setFailed('The github-token parameter is required!')
    }
}

async function getTag(){
    try{
        let numberTag = await findTag()
        if(numberTag.status == 200){
            let lastTag = numberTag.data.pop().ref.split('/').pop()
            console.log('The tag found is', lastTag)
            if(!validateTag(lastTag)){
                console.log(`The tag ${lastTag} is not a valid tag!`)
            }else{
                return lastTag
            }            
        }
    }catch(error){
        core.setFailed("No tags have been defined for your project. Set a tag and run the action again!", error)
        return false
    }
}

function validateTag(tag){
    
    const defaulTag = tag.match('([v0-9|0-9]+).([0-9]+).([0-9]+)')
    if(defaulTag){
        return tag
    }
    
    return false
}
async function findTag(){
    return octokit.request('GET /repos/{owner}/{repo}/git/refs/tags', param)
}

async function setVersion(newVersion){
    let content = await getContent()
    let sha = content != 404 ? content.data.sha : null
    let download_url = content != 404 ? content.data.download_url : null
    if (download_url != null){
        let {data} = await getContentFile(download_url)
        await modifyVersionAndUploadFile(data, sha, newVersion)
    }else{
        core.setFailed('Path invalido!')
    }
}

async function getContent(){
    try{
        if(path != 'CHANGELOG.md')
            pathPackageJsonConfigure()
        param['path'] = path
        let res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', param)
        if (res.status  == 200){
            delete param.path
            return res
        }
    }catch(error){
        delete param.path
        return error.status   
    }
}

function pathPackageJsonConfigure(){
    if(path && path != ''){
        if(path.split('/').pop() == ''){
            path = path.slice(0, -1)
            path += '/package.json' 
        }else{
            path = `${path}/package.json`
        }
    }else{
        path = path != '' ? `${path}/package.json`: 'package.json'
        path = `package.json`
    }
}

async function getContentFile (raw_url){
    try{
        return axios.get(raw_url, {
            headers: {
                Authorization: `Bearer ${githubToken}`
            }
        })
    }catch(error){
        core.setFailed('Error getting file content!')
    }
}

async function modifyVersionAndUploadFile(data, sha, newVersion){
    if (data && data != ''){
        try{
            await exec("yarn cache clean")
            await exec("yarn install --ignore-workspace-root-check")
            await exec("ls")
            
            let fileRead =  ''
            if(path.split('/').length >1){
                console.log('with directory')
                if (path.split('/')[0]== ''){
                    let dir = path.slice(0, -1)
                    fileRead = fs.readFileSync(dir, 'utf8').toString()
                }
                console.log('object with directory: ',fileRead )
            }else{
                fileRead = fs.readFileSync(`./package.json`, 'utf8').toString()
                console.log('object without directory: ',fileRead )
            }
            console.log("modifyVersionAndUploadFile fileRead:", fileRead)
            let defaultVersion = /"version":[\s]+"([v0-9|0-9]+).([0-9]+).([0-9]+)"/
            newVersion = newVersion.split(/([a-z]|[A-z])+\.*/).pop()
            console.log("modifyVersionAndUploadFile newVersion:", newVersion)
            fileRead = fileRead.replace(defaultVersion, `"version": "${newVersion}"`)
            console.log("modifyVersionAndUploadFile fileRead:", fileRead)
            let fileBase64 = base64.encode(fileRead)
            console.log("modifyVersionAndUploadFile fileBase64:", fileBase64)
            console.log("modifyVersionAndUploadFile path:", path)
            await uploadGithub(fileBase64, path, sha)
        }catch(error){
            console.log('Failed to update package.json version!',error)
        }
    }else{
        core.setFailed('Failed to read file!')
    }
}

async function uploadGithub(content, fileName, sha){
    if(path.substr(0, 1) == '/'){
        path = path.substr(1)
    }
    
    param['path'] = fileName != 'CHANGELOG.md'? path : fileName
    param['message'] = sha == null ? `ci: Create ${fileName}` : `ci: Update ${fileName}`
    param['content'] = content
    if(sha != null)
        param['sha'] = sha

        console.log('log uploadFileBase64 param:',param)
        console.log('log uploadFileBase64 content:',content)
        console.log('log uploadFileBase64 fileName:',fileName)
        console.log('log uploadFileBase64 sha:',sha)
    uploadFileBase64()
}

async function uploadFileBase64(){
    try{
        console.log('log uploadFileBase64 param:',param)
        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', param).then(()=>{
            console.log({
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                },
                'body': {
                    'message': param.message,
                }
            })
            delete param.path
            delete param.message
            delete param.content
            delete param.sha
            core.setOutput("success", param.message)
            
        })
    }catch(error){
        core.setFailed("Error ao commitar file: ",error)
    }
}

async function generateChangelog(){
    await exec('yarn add auto-changelog --dev --ignore-workspace-root-check')
    await exec('yarn auto-changelog -p')
}

run()