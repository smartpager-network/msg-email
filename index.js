const ImapSimple = require('imap-simple')
const mailparser = require('mailparser')
const fs = require('fs')
if (!fs.existsSync('./credentials.json')) fs.copyFileSync('./credentials.default.json', './credentials.json')
let $ImapConnection

const config = require('./config.json')
config.imap = require('./credentials.json')
//config.onmail = () => ScanUnread()
const axios = require('axios')

const searchCriteria = ['UNSEEN']
const fetchOptions = {
	bodies: ['HEADER', 'TEXT', ''],
	markSeen: false,
	struct: true,
}
const ignoreImapIDs = []
function main() {
	ImapSimple
		.connect(config)
		.then((connection) => {
			$ImapConnection = connection
		})
		.then(ScanUnread)
}
async function sendPage(payload) {
	console.log(payload)
	await axios.post(config.pager.url, Object.assign({ ...config.pager.params }, { payload }))
}
function checkMatch(mail, cmd) {
	if (!!cmd.subjectContains && !(mail.subject.indexOf(cmd.subjectContains) > -1)) return 0 // subjectContains does not match
	if (!!cmd.mxdomainExact && !(mail.from.value[0].address)) return 0
	if (!!cmd.mxdomainContains && !(mail.from.value[0].address.indexOf(cmd.mxdomainContains) > -1)) return 0 // mxdomainContains does not match

	return !!cmd.ignore ? 1 : 2 // if ignore is set, lets break with 1, otherwise send page with 2
}
async function processMail(mail) {
	for (processCommand of config.handling.processing) {
		let res = checkMatch(mail, processCommand)
		if (res) {
			if (!!processCommand.format && !processCommand.ignore) {
				let payload = processCommand.format
				payload = payload.replace("[subject]", mail.subject)
				payload = payload.replace("[from]", mail.from.text)
				payload = payload.replace("[fromName]", mail.from.value[0].name || mail.from.value[0].address)
				payload = payload.replace("[fromAddress]", mail.from.value[0].address)
				sendPage(payload)
			}
		}
	}
}
function ScanUnread() {
	return $ImapConnection.openBox('INBOX')
		.then(() => $ImapConnection.search(searchCriteria, fetchOptions))
		.then((emails) => {
			console.log('unreadCount:', emails.length)
			if (emails.length > 0 && config.handling.onlySimpleCounter === true) {
				sendPage(config.handling.onlySimpleCounterFormat.replace("[unreadCount]", emails.length))
			} else {
				for (let mail of emails) {
					const all = mail.parts.filter(x => x.which == '')[ 0 ]
					const idHeader = `Imap-Id: ${mail.attributes.uid}\r\n`
					if (ignoreImapIDs.indexOf(mail.attributes.uid) > -1) continue // Skip already notified mails
					ignoreImapIDs.push(mail.attributes.uid)
					mailparser.simpleParser(idHeader + all.body).then(processMail)
				}
			}
		})
}
main()








const express = require('express')
const appConfig = express()
appConfig.use(express.json())
appConfig.use(express.static('html'))

/** CONFIG Routes */

appConfig.get('/config', async (req, res) => {
    return res.json(JSON.parse(fs.readFileSync('config.json')))
})
appConfig.post('/config', async (req, res) => {
    if (!(!!req.body.pager)) return res.status(403).json(false)
    if (!(!!req.body.handling)) return res.status(403).json(false)
    console.log(req.body)
    fs.writeFileSync('config.json', JSON.stringify(req.body, null, "\t"))
    return res.json(true)
})
appConfig.get('/credentials', async (req, res) => {
    return res.json(JSON.parse(fs.readFileSync('credentials.json')))
})
appConfig.post('/credentials', async (req, res) => {
    fs.writeFileSync('credentials.json', JSON.stringify(req.body, null, "\t"))
    return res.json(true)
})
appConfig.post('/restart', (req, res) => {
    process.exit(1)
})

appConfig.listen(3010)