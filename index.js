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
                setVersion(newVersion)
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
        modifyVersionAndUploadFile(data, sha, newVersion)
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

function modifyVersionAndUploadFile(data, sha, newVersion){
    if (data && data != ''){
        if(modifyVersion(data, newVersion) && modifyVersion(data, newVersion) != ''){
            let newFile = modifyVersion(data, newVersion)
            let fileBase64 = base64.encode(JSON.stringify(newFile))
            uploadGithub(fileBase64, path, sha)
        }else{
            core.setFailed('Failed to update package.json version!')
        }
    }else{
        core.setFailed('Failed to read file!')
    }
}

function modifyVersion (package_json_obj, newVersion){
    package_json_obj.version = newVersion.split(/([a-z]|[A-z])+\.*/).pop()
    return package_json_obj
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

    
    uploadFileBase64()
}

async function uploadFileBase64(){
    try{
        
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
            core.setOutput("success", message)
            
        })
    }catch(error){
        core.setFailed("Error ao commitar file: ",error)
    }
}

async function generateChangelog(){
    await exec('yarn install ')
    await exec('yarn add auto-changelog --dev')
    await exec('yarn auto-changelog -p')
}

run()