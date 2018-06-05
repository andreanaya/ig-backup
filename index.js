const request = require('superagent');
const md5 = require('md5');
const fs = require('fs');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QUERY_HASH = '33ba35852cb50da46f5b5e889df7d159';
const SHORT_CODE = process.env.CODE;
const USER_AGENT = 'User Agent';

const logFile = process.env.CODE+'_'+(new Date().toISOString().split('T')[0].replace(/-/igm, ''))+'.log';
const log = process.env.CRON === undefined;

const Comment = mongoose.model('comments', new Schema({
	id: { type: String, required: true, unique: true },
	text: { type: String, required: true },
	tags: { type: [String], required: true },
	owner: { type: String, required: true },
	date: { type: Date, required: true },
	epoch: { type: Number, required: true }
}));

const Timestamp = mongoose.model('timestamp', new Schema({
	epoch: { type: Number, required: true, unique: true }
}));


function getTimestamp() {
	return new Date().toISOString();
}

async function getSig(agent) {
	let userAgent = (agent || USER_AGENT);

	let res = await request.get('http://www.instagram.com')
		.set('User-Agent', userAgent);
	let html = res.text;
	let regexp = /<script type=\"text\/javascript\">window._sharedData\s?=\s?([^;]*);<\/script>/igm;

	let match = regexp.exec(html);
	
	let json = JSON.parse(match[1]);
	let sig = json.rhx_gis;

	fs.writeFileSync(logFile, '['+getTimestamp()+'] New User-Agent '+userAgent+'\n', { encoding: 'utf8', flag: 'a' });
	fs.writeFileSync(logFile, '['+getTimestamp()+'] New Sig '+sig+'\n', { encoding: 'utf8', flag: 'a' });

	return sig;
}

async function processComments(comments) {
	let edges = comments.edges.filter((edge) => {
		if(edge.node.created_at > this.current) {
			return true;
		} else {
			fs.writeFileSync(logFile, '['+getTimestamp()+'] Comment created before last backup '+edge.node.id+' current epoch '+this.current+'.\n', { encoding: 'utf8', flag: 'a' });
			return false;
		}
	}).map((edge) => {
		let tags = [];
		let regexp = /@[a-zA-Z0-9._]*/igm;
		let match;

		while(match = regexp.exec(edge.node.text)) {
			tags.push(match[0]);
		}

		let date = new Date(0);
		date.setUTCSeconds(edge.node.created_at);

		return {
			id: edge.node.id,
			text: edge.node.text,
			tags: tags,
			owner: edge.node.owner.username,
			date: date,
			epoch: edge.node.created_at
		}
	});

	try {
		await Comment.insertMany(edges);
	} catch(error) {
		fs.writeFileSync(logFile, '['+getTimestamp()+'] Save error. '+error.message+'\n', { encoding: 'utf8', flag: 'a' });
	}

	let d0 = new Date(0);
	d0.setUTCSeconds(this.current);
	d0 = d0.toLocaleDateString()+' '+d0.toLocaleTimeString();

	let first = edges.sort((a, b) => a.date > b.date).pop();

	if(first) {
		first = first.epoch;
	} else{
		first = comments.edges.sort((a, b) => a.node.created_at > b.node.created_at).pop().node.created_at;
	}

	let d1 = new Date(0);
	d1.setUTCSeconds(first);
	d1 = d1.toLocaleDateString()+' '+d1.toLocaleTimeString();

	let count = await Comment.count();

	if(log) process.stdout.clearLine();
	if(log) process.stdout.cursorTo(0);
	if(log) process.stdout.write(count+'\t'+comments.count+' '+(100*count/comments.count>>0)+'%\t'+d0+'\t'+d1);
	
	fs.writeFileSync(logFile, '['+getTimestamp()+'] Added '+(100*count/comments.count>>0)+'% of comments. '+count+'/'+comments.count+'\n', { encoding: 'utf8', flag: 'a' });

	if(comments.page_info.has_next_page && first > this.current) {
		setTimeout(() => {
			getComments.call(this, comments.page_info.end_cursor);
		}, 1000);
	}
	else if(comments.page_info.has_next_page === false && count/comments.count < 0.9) {
		setTimeout(() => {
			getComments.call(this);
		}, 1000);
	}
	else {
		fs.writeFileSync(logFile, '['+getTimestamp()+'] Complete.\n', { encoding: 'utf8', flag: 'a' });

		try {
			let last = await Comment.findOne({}, {epoch: 1}, {sort:{ date: -1 }});
			let timestamp = new Timestamp({epoch: last.epoch});
			await timestamp.save();

			await mongoose.connection.close();
			fs.writeFileSync(logFile, '['+getTimestamp()+'] Mongo connection closed.\n', { encoding: 'utf8', flag: 'a' });
		} catch(error) {
			fs.writeFileSync(logFile, '['+getTimestamp()+'] '+error+'.\n', { encoding: 'utf8', flag: 'a' });
		}
	}

}

async function getComments(after) {
	let json = {
		shortcode: SHORT_CODE,
		first: 50
	}

	if(after) json.after = after;

	let jsonString = JSON.stringify(json);

	try {
		let igsig = md5(this.sig+':'+jsonString);
		let query = {'query_hash': QUERY_HASH, 'variables': jsonString};

		fs.writeFileSync(logFile, '['+getTimestamp()+'] Call userAgent:'+this.userAgent+' igsig:'+igsig +' jsonString:'+encodeURIComponent(jsonString)+'\n', { encoding: 'utf8', flag: 'a' });

		let res = await request.get('http://instagram.com/graphql/query/')
			.query(query)
			.set('X-Instagram-GIS', igsig)
			.set('User-Agent', this.userAgent)

		let comments = res.body.data.shortcode_media.edge_media_to_comment;
		this.total = comments.count
		fs.writeFileSync(logFile, '['+getTimestamp()+'] Process '+comments.edges.length+' comments\n', { encoding: 'utf8', flag: 'a' });

		setTimeout(()=> {
			processComments.call(this, comments)
		}, 1000)
	} catch(err) {
		if(err.response && err.response.body && err.response.body.message == 'rate limited') {
			fs.writeFileSync(logFile, '['+getTimestamp()+'] Rate Limit '+after+'\n', { encoding: 'utf8', flag: 'a' });
			if(log) process.stdout.write('\n\nRate limit\n\n');

			let countdown = 60 * 5;

			let id = setInterval(()=> {
				if(log) process.stdout.clearLine();
				if(log) process.stdout.cursorTo(0);
				if(log) process.stdout.write((--countdown)+'s');

				if(countdown == 0) {
					clearInterval(id);
					getComments.call(this, after);
				}
			}, 1000)
		} else {
			fs.writeFileSync(logFile, '['+getTimestamp()+'] Error '+err.toString()+'\n', { encoding: 'utf8', flag: 'a' });
			if(log) process.stdout.write('\n\nERROR!!!\n\n');
			if(log) process.stdout.write(err.toString());
			if(log) process.stdout.write('\n\n############\n\n');
			if(log) process.stdout.write('\n\n############\n\n');
			if(log) process.stdout.write(JSON.stringify(err));
		}
	}
}

async function init() {
	try {
		await mongoose.connect(process.env.MONGODB_URI+'/'+SHORT_CODE);

		fs.writeFileSync(logFile, '['+getTimestamp()+'] Mongoose connected to '+process.env.MONGODB_URI+'/'+SHORT_CODE+'.\n', { encoding: 'utf8', flag: 'a' });
		
		let latest = await Timestamp.findOne({}, {epoch: 1}, {sort:{ date: -1 }});

		let current = latest?latest.epoch:0;

		fs.writeFileSync(logFile, '['+getTimestamp()+'] Current timestamp '+current+'\n', { encoding: 'utf8', flag: 'a' });

		let userAgent = USER_AGENT+' '+Date.now();
		let sig = await getSig(userAgent);

		let context = {sig:sig, userAgent:userAgent, current: current}

		if(process.env.AFTER === undefined) {
			let res = await request.get('http://instagram.com/p/'+SHORT_CODE+'/')
				.query({'__a': 1})
				.set('User-Agent', userAgent);

			let comments = res.body.graphql.shortcode_media.edge_media_to_comment;
			processComments.call(context, comments);
		} else {
			getComments.call(context, process.env.AFTER);
		}
	} catch(error) {
		fs.writeFileSync(logFile, '['+getTimestamp()+'] '+error.toString()+'.\n', { encoding: 'utf8', flag: 'a' });

		await mongoose.connection.close();
		fs.writeFileSync(logFile, '['+getTimestamp()+'] Mongo connection closed.\n', { encoding: 'utf8', flag: 'a' });
	}
}

init();
