var http = require('http');
var async = require('async');
var querystring = require('querystring');

var _env;
var _token;
var _branches = [];
var _msg = [];
var _lastTime;

function gitlab() {
}

gitlab.run = function(time, env, callback) {
	_env = env;
	_lastTime = time;
	async.waterfall([
		procGetToken,
		procGetMergeRequests,
		procGetBranches,
		procGetAllCommits
	], function complete(err) {
		callback(_msg);
	});
};

function httpRequest(options, requestBody, callback) {
	var req = http.request(options, function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		});
		res.on('end', function() {
			var json = JSON.parse(body);
			callback(json);
		});
	}).on('error', function(e) {
		console.log("gitlab http request error!");
		console.log(e.message);
	});
	if (requestBody) {
		req.write(requestBody);
	}
	req.end();
};

function procGetToken(next) {
	var authParam = 'login=' + _env.id + '&password=' + _env.pw;
	httpRequest({
		hostname: _env.host,
		path: '/api/v3/session',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	}, authParam, function(json) {
		_token = json["private_token"];
		next();
	});
};

function procGetMergeRequests(next) {
	var url = '/api/v3/projects/' + _env.project + '/merge_requests?state=opened&private_token=' + _token
	httpRequest({
		hostname: _env.host,
		path: url,
		method: 'GET'
	}, null, function(list) {
		for (var i=0;i<list.length;i++) {
			var data = {}
			var item = list[i];
			if (_lastTime.getTime() > (new Date(item.updated_at)).getTime()) {
				continue;
			}
			data.type = 'MergeRequest';
			data.msg = '[MergeRequest](http://' + _env.host + '/' + _env.group + '/' + _env.repo + '/merge_requests/'  + item.iid + ') ';
			data.msg += item.title;
			data.msg += '\n';
			data.msg += ' UpVote(' + item.upvotes + ') DownVote(' + item.downvotes + ')';
			data.msg += ' From ' + item['source_branch'] + ' into ' + item['target_branch']; 
			data.msg +=  ' (' + item.author_name + ') ' + makeDateStr(new Date(item.updated_at))
			data.msg += '\n';
			data.msg += item.description;
			data.icon = _env['icon'];
			_msg.push(data);
		}
		next();
	});
};

function procGetBranches(next) {
	httpRequest({
		hostname: _env.host,
		path: '/api/v3/projects/' + _env.project + '/repository/branches?private_token=' + _token,
		method: 'GET'
	}, null, function(list) {
		for (var i=0;i<list.length;i++) {
			var date;
			if (list[i].commit) {
				date = list[i].commit['committed_date'];
				if (_lastTime.getTime() > (new Date(date)).getTime()) {
					continue;
				}
			}
			_branches.push(list[i].name);
		}
		next();
	});
};

function procGetAllCommits(next) {
	async.eachSeries(_branches, function iterator(item, callback) {
		readCommits(item, function() {
			callback();
		});
	}, function(err) {
		next();
	});
}


function readCommits(branch, callback) {
	var url = '/api/v3/projects/' + _env.project + '/repository/commits?private_token=' + _token;
	if (branch) {
		url = url + '&ref_name=' + branch;
	}
	httpRequest({
		hostname: _env.host,
		path: url,
		method: 'GET'
	}, null, function(list) {
		for (var i=0;i<list.length;i++) {
			var item = list[i];
			if (_lastTime.getTime() > (new Date(item.created_at)).getTime()) {
				continue;
			}
			var data = {}
			data.type = 'Commit';
			data.msg = '[Commit to \'' + branch + '\'](http://' + _env.host + '/' + _env.group + '/' + _env.repo + '/commit/' + item.id +')';
			data.msg += ' : ' + item.title + '(' + item.author_name + ') ' + makeDateStr(new Date(item.created_at)) ;
			data.msg += '\n';
			data.msg += item.message;
			data.icon = _env['icon'];
			_msg.push(data);
		}
		callback();
	});
}

function makeDateStr(date) {
	var dateStr = [];
	dateStr.push(dec(date.getMonth()+1));
	dateStr.push('/');
	dateStr.push(dec(date.getDate()));
	dateStr.push(' ');
	dateStr.push(dec(date.getHours()));
	dateStr.push(':');
	dateStr.push(dec(date.getMinutes()));
	return dateStr.join('');
}

function dec(value) {
	return (value < 10)? '0' + value : value;
}

module.exports = gitlab;