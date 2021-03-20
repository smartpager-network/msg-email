const ImapSimple = require('imap-simple')
const mailparser = require('mailparser')
let $ImapConnection

const config = require('./config.json')
config.imap = require('./credentials.json')
config.onmail = () => ScanUnread()

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
	await axios.post(config.pager.url, Object.assign({ ...config.pager.params }, { payload }))
}
async function processMail(mail) {
	let handling = "default"
	let payload = config.handling.processing[handling]
	payload = payload.replace("[subject]", mail.subject)
	payload = payload.replace("[from]", mail.from.text)
	payload = payload.replace("[fromName]", mail.from.value.name || mail.from.value.address)
	payload = payload.replace("[fromAddress]", mail.from.value.address)
	sendPage(payload)
}
function ScanUnread() {
	return $ImapConnection.openBox('INBOX')
		.then(() => $ImapConnection.search(searchCriteria, fetchOptions))
		.then((emails) => {
			console.log('unreadCount:', emails.length)
			if (config.handling.onlySimpleCounter === true) {
				sendPage(config.handling.onlySimpleCounterFormat.replace("[unreadCount]", emails.length))
			} else {
				for (let mail of emails) {
					const all = mail.parts.filter(x => x.which == '')[0]
					const idHeader = `Imap-Id: ${mail.attributes.uid}\r\n`
					if (ignoreImapIDs.indexOf(mail.attributes.uid) > -1) continue // Skip already notified mails
					ignoreImapIDs.push(mail.attributes.uid)
					mailparser.simpleParser(idHeader + all.body).then(processMail)
				}
			}
		})
}
main()