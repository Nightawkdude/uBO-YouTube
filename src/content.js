'use strict';

((window, document, browser, undefined) => {
	const video = 1;
	const channel = 2;
	const search = 3;
	const home = 4;
	const ad = 5;
	const allelse = -1;
	const lpoly = 2; //new polymer layout
	const lbasic = 1; //old basic layout, less and less supported as time goes on

	let settings = {whitelisted: [], blacklisted: []};

	browser.runtime.sendMessage({action: "get"}, response => {
		settings = response;
		//allows us to access local javascript variables, needed to pre-append &disable flag to video lists
		let head = document.documentElement;
		let relatedScript = document.createElement("script");
		relatedScript.setAttribute("type", "text/javascript");
		relatedScript.setAttribute("src", browser.runtime.getURL("inject.js")); 
		head.appendChild(relatedScript);
		//adding styles for UBO button
		let styleSheet = document.createElement("link");
		styleSheet.setAttribute("rel", "stylesheet");
		styleSheet.setAttribute("type", "text/css");
		styleSheet.setAttribute("href", browser.runtime.getURL("inject.css"));
		head.appendChild(styleSheet);

		document.addEventListener("DOMContentLoaded", () => {
			let mode = getMode();
			let layout = document.querySelector("ytd-app") ? lpoly : lbasic; //dirty, but just for the initial load
			let prevurl = location.href;

			updatePage(mode, layout);
			//in case of settings change due to activity in another tab
			browser.runtime.onMessage.addListener((requestData, sender, sendResponse) =>  {
		    	if(requestData.action === "update"){
					settings = requestData.settings;
					updatePage(mode, layout, true);
				}
			});

			(new MutationObserver(mutations =>  {
				if(location.href !== prevurl){
					mode = getMode();
					prevurl = location.href;
				}

				for(let mutation of mutations){
					if(mode === video){
						if(mutation.target.id === "movie_player"
							|| (
								mutation.target.id === "player-container"
								&& mutation.addedNodes.length
								&& mutation.addedNodes[0].id === "movie_player")
							|| mutation.target.className === "ytp-title-channel-name"
						){
							//video player update, or first added
							let player = mutation.target.id === "movie_player" ? mutation.target : document.querySelector("#movie_player");
							if(player.classList.contains("ad-showing")){
								updateAdShowing(player);
							}
						}else{
							if(
								mutation.type === "attributes"
								&& mutation.attributeName === "href"
								&& mutation.target.classList[0] === "yt-simple-endpoint"
								&& mutation.target.parentNode.id === "owner-name"
							){
								//new layout, username property changed
								updateVideoPage(lpoly);
							}else if(
								mutation.type === "attributes"
								&& mutation.target.id === "continuations"
								&& mutation.attributeName === "hidden"
							){
								//new layout, related has finished loading
								updateVideoPage(lpoly);
							}else{
								for(let node of mutation.addedNodes){
									if(
										node.id === "watch7-main-container"
										|| node.localName === "ytd-video-secondary-info-renderer"
									){
										//username created, old layout, and newlayout on first load
										updateVideoPage(lbasic, node);
									}
								}
							}

						}
					}else if(mode === channel || mode === allelse){
						//these are all about detecting that loading has finished.
						let finishedLoading = 0;

						if(
							mutation.type === "attributes"
							&& mutation.target.localName === "yt-page-navigation-progress"
							&& mutation.attributeName === "hidden"
						){
							//done loading
							if(mutation.oldValue === null)
								finishedLoading = lpoly;
						}else if(mutation.target.id === "subscriber-count"){
							//update the UCID in the dom
							callAgent("updateChannel");//, {}, (channelId){console.log("new id", channelId);}) => 
						}

						//oldlayout
						for(let node of mutation.removedNodes){
							if(node.id === "progress"){
								finishedLoading = lbasic;
								break;
							}
						}

						if(finishedLoading){
							if(mode === channel)
								updateChannelPage(finishedLoading);
							else if(mode === allelse)
								updateVideolists(finishedLoading);
							break;
						}
					}

				}
			})).observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["hidden", "href"],
				attributeOldValue: true
			});
		})
	})

	function getMode(){
		if(location.href.indexOf("youtube.com/watch?") !== -1){
			return video;
		}else if(location.href.indexOf("youtube.com/channel/") !== -1 || location.href.indexOf("youtube.com/user/") !== -1){
			return channel;
		}else{
			return allelse;
		}
	}

	function getChannelId(element, mode){
		let links, link, channelId = {id: "", username: "", display: ""};
		
		if(!mode) 
			mode = getMode();
		if(!element) 
			element = document;

		if(mode === video){
			links = element.querySelectorAll("ytd-video-owner-renderer a, [id='watch7-user-header'] a");
		}else if(mode === channel){
			links = [location];
			link = document.querySelector("link[rel='canonical']");
			if(link) links.push(link);

			channelId.display = document.querySelector("#channel-header #channel-title,.branded-page-header-title-link").textContent;
		}else if(mode === ad){
			links = [element];
		}else return false;

		for(let link of links){
			let matches;

			if(!link.href) continue;

			if(matches = link.href.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/)){
				if(matches[1] === "user")
					channelId.username = matches[2]
				else if(matches[1] === "channel"){
					channelId.id = matches[2];
					if(link.textContent) 
						channelId.display = link.textContent;
				}
			}

		}
		
		if(channelId.id || channelId.username)
			return channelId;
		else
			return false;
	}

	function updateURL(verify, channelId){
		channelId = channelId || getChannelId();
		if(!channelId) return;

		if(location.href.indexOf("&disableadblock") !== -1){
			if(inwhitelist(channelId) === -1){
				window.history.replaceState(history.state, "", location.href.replace("&disableadblock=1", ""));
				return false;
			}else return true;
		}else{
			if(inwhitelist(channelId) !== -1){
				window.history.replaceState(history.state, "", location.href + (location.href.indexOf("?") === -1 ? "?" : "") + "&disableadblock=1");

				if(verify) verifyDisabled();
				return true;
			}else return false;
		}
	}

	function updatePage(mode, layout, forceUpdate){
		if(mode === video) updateVideoPage(layout, undefined, forceUpdate);
		else if(mode === channel) updateChannelPage(layout, undefined, forceUpdate);
		else if(mode === allelse) updateVideolists(layout, undefined, forceUpdate);
	}

	function whitelistButton(layout, toggled, ref){
		if(ref){
			//button already exists, update whitelist toggle on pre-existing button rather than create new one
			if(!toggled){
				if(ref.classList.contains("yt-uix-button-toggled"))
					ref.classList.remove("yt-uix-button-toggled");
			}else{
				if(!ref.classList.contains("yt-uix-button-toggled"))
					ref.classList.add("yt-uix-button-toggled");
			}

			return;
		}

		let button = document.createElement("button");
		button.className = "UBO-button";
		button.addEventListener("click", event => {
			let channelId = getChannelId(), button = event.target; //allow parent scope to be discarded
			if(inwhitelist(channelId) !== -1){
				let index;

				while((index = inwhitelist(channelId)) !== -1){
					settings.whitelisted.splice(index, 1);
				}
				button.classList.remove("yt-uix-button-toggled");
			}else{
				settings.whitelisted.push(channelId);
				button.classList.add("yt-uix-button-toggled");
			}

			browser.runtime.sendMessage({action: "update", settings: settings}, response => {
				if(response) console.log(response)
			})
			updateURL(true, channelId);
			updateRelated(layout, true);
		}, false);

		if(layout === lpoly){
			let buttonContainer;
			button.className += " UBO-poly " + (toggled ? " yt-uix-button-toggled" : "");
			button.innerHTML = "ADS";
			buttonContainer = document.createElement("div");
			buttonContainer.appendChild(button);

			return buttonContainer;
		}else if(layout === lbasic){
			button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (toggled ? " yt-uix-button-toggled" : "");
			button.innerHTML = "Ads";

			return button;
		}
	}
	function updateVideoPage(layout, element, forceUpdate){
		let container;

		if(layout === lpoly){
			container = document.querySelector("ytd-video-owner-renderer")
		}else if(layout === lbasic){
			container = document.querySelector("#watch7-subscription-container")
		}

		if(!container) return;
		if(!element) element = container;

		let channelId = getChannelId(element);
		let whitelisted = updateURL(false, channelId);
		let button;

		if(button = whitelistButton(layout, whitelisted, container.parentNode.querySelector(".UBO-button"))){
			//add the new button, otherwise the status was updated on a pre-existing button
			if(container.nextSibling){
				container.parentNode.insertBefore(button, container.nextSibling);
			}else{
				container.parentNode.appendChild(button);
			}
		}

		updateRelated(layout, forceUpdate);
	}

	function updateRelated(layout, forceUpdate){
		if(layout === lpoly){
			//update via local JS variables on the page
			callAgent("updateVideoLists", {settings: settings, type: "related", forceUpdate: forceUpdate})
		}else if(layout === lbasic){
			//update via information available on the DOM
			let videos = document.querySelectorAll(".video-list-item");

			for(let vid of videos){
				if(!forceUpdate && vid.processed) continue;

				let user = vid.querySelector("[data-ytid]");
				if(!user)
					continue;
				else
					user = user.getAttribute("data-ytid");
				if(inwhitelist({id: user}) !== -1){
					let links = vid.querySelectorAll("a[href^='/watch?']");
					for(let link of links)
						link.href += "&disableadblock=1";
				}

				vid.processed = true;
			}
		}
	}

	function updateChannelPage(layout, forceUpdate){

		let channelId = getChannelId();
		let whitelisted = updateURL(false, channelId);
		let container, button;

		if(layout === lpoly) 
			container = document.querySelector("#edit-buttons");
		else if(layout === lbasic) 
			container = document.querySelector(".primary-header-actions");

		if(!container) return;

		if(button = whitelistButton(layout, whitelisted, container.querySelector(".UBO-button")))
			container.appendChild(button); //add only if it doesn't already exist

		if(whitelisted){
			updateVideolists(layout, channelId, forceUpdate);
		}
	}

	function updateVideolists(layout, channelId, forceUpdate){
		//videos from places like the home page, channel page, search results, etc.
		//basically anything that isn't the /watch?v= page
		if(layout === lpoly){
			callAgent("updateVideoLists", {settings: settings, channelId: channelId, type: "general", forceUpdate: forceUpdate});
		}else if(layout === lbasic){
			let videos = document.querySelectorAll(".yt-lockup-video");

			for(let vid of videos){
				if(!forceUpdate && vid.processed) continue;

				let user = vid.querySelector(".g-hovercard.yt-uix-sessionlink");
				let values = {id: ""};

				if(!user || !(values.id = user.getAttribute("data-ytid")))
					if(channelId)
						values = channelId;
					else
						continue;
	
				if(inwhitelist(values) !== -1){ //exists
					let links = vid.querySelectorAll("a[href^='/watch?']");
					for(let link of links){
						link.href += "&disableadblock=1";
					}
				}
				vid.processed = true;
			}
		}
	}

	function updateAdShowing(player){
		let container, blacklistButton;

		if(!player.querySelector("#BLK-button")){
			container = player.querySelector(".ytp-right-controls");

			if(!container){
				console.error("Cannot find .ytp-right-controls");
				return;
			}

			blacklistButton = parseHTML('<button class="ytp-button" id="BLK-button"><span class="BLK-tooltip">Blacklist this advertiser</span><div class="BLK-container"><img src="' + browser.runtime.getURL("img/icon_16.png") + '"></div></button>').querySelector("#BLK-button");
			blacklistButton.addEventListener("click", () => {
				browser.runtime.sendMessage({action: "blacklist"}, response => {
					if(response.error) 
						console.error(response.error, response);
					else
						location.reload();
				})
			})
			container.insertBefore(blacklistButton, container.firstChild);
		}
	}

	function callAgent(externalFunction, data, callback){
		let msgFunc;
		let callbackId = "";

		if(callback){
			if(typeof callback !== "function"){
				console.error("Callback supplied is not a function");
				return false;
			}
			callbackId = Math.random().toString(36).substring(7); //random 7 char string
			window.addEventListener("message", msgFunc = event => {
				if(event.data.origin || !event.data.callbackId || event.data.callbackId !== callbackId) return;
				callback(event.data.callbackMessage);
				window.removeEventListener("message", msgFunc);
			});
		}
		//external for us, means internal for them
		window.postMessage({internalFunction: externalFunction, message: data, callbackId: callbackId, origin: true}, "*");
	}

	function verifyDisabled(){
		setTimeout(() => {
			let iframe = document.createElement("iframe");
			iframe.height = "1px";
			iframe.width = "1px";
			iframe.id = "ads-text-iframe";
			iframe.src = "https://googleads.g.doubleclick.net/pagead/";

			document.body.appendChild(iframe);
			setTimeout(() => {
				let iframe = document.getElementById("ads-text-iframe");
				if(iframe.style.display == "none" || iframe.style.display == "hidden" || iframe.style.visibility == "hidden" || iframe.offsetHeight == 0)
					prompt("Ads may still be blocked, make sure you've added the following rule to your adblocker whitelist", "*youtube.com/*&disableadblock=1");
				iframe.remove();
			}, 500);
		}, 800)
	}

	function inwhitelist(search){
		for(let index in settings.whitelisted){
			for(let id in search){
				if(id !== "display" && settings.whitelisted[index][id] === search[id] && search[id].length)
				return index;
			}
		}
		return -1;
	}

	function parseHTML(markup) {
		if (markup.toLowerCase().trim().indexOf('<!doctype') === 0) {
			var doc = document.implementation.createHTMLDocument("");
			doc.documentElement.innerHTML = markup;
			return doc;
		} else if ('content' in document.createElement('template')) {
			// Template tag exists!
			var el = document.createElement('template');
			el.innerHTML = markup;
			return el.content;
		} else {
			// Template tag doesn't exist!
			var docfrag = document.createDocumentFragment();
			var el = document.createElement('body');
			el.innerHTML = markup;
			for (i = 0; 0 < el.childNodes.length;) {
				docfrag.appendChild(el.childNodes[i]);
			}
			return docfrag;
		}
	}
})(window, document, chrome ? chrome : browser)
