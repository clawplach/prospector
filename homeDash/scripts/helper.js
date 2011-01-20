/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Home Dash Helper Functions.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

// Extract the sub/domains of a URI
function getHostText(URI) {
  let host = hosty(URI, true);
  try {
    // Strip the suffix unless there is no suffix (e.g., localhost)
    let suffix = Services.eTLD.getPublicSuffix(URI);
    let noSuffix = host;
    if (suffix != host)
      noSuffix = host.slice(0, (host + "/").lastIndexOf(suffix) - 1);

    // Ignore "www"-like subdomains
    let domains = noSuffix.split(".");
    if (domains[0].search(/^www\d*$/) == 0)
      domains.shift();

    // Upper-case each first letter and put subdomains in reverse order
    host = upperFirst(domains.reverse());
  }
  // eTLD will throw if it's an IP address, so just use the host
  catch(ex) {}

  // Add the scheme if it's not http(s)
  let scheme = URI.scheme;
  if (scheme.indexOf("http") == -1)
    host = scheme + ": " + host;
  return host;
}

// Lookup a keyword to suggest for the provided query
function getKeyword(query) {
  let queryLen = query.length;
  let sortedLen = sortedKeywords.length;
  for (let i = 0; i < sortedLen; i++) {
    let keyword = sortedKeywords[i];
    if (keyword.slice(0, queryLen) == query)
      return keyword;
  }
}

// Get a favicon for a tab
function getTabIcon(tab) {
  // Use the favicon from the tab if it's there
  let src = tab.getAttribute("image");
  if (src != "")
    return src;

  // Use the default tab favicon
  return images["defaultFavicon.png"];
}

// Try to find a usable text from a node
function getTextContent(node) {
  // Nothing to do with nothing
  if (node == null)
    return "";

  // Remove extra spaces
  function cleanup(text) {
    return text.trim().replace(/\s+/, " ");
  }

  // Use plain text content or alternative text when available
  if (node.textContent.trim() != "")
    return cleanup(node.textContent);
  if (node.alt != null && node.alt.trim() != "")
    return cleanup(node.alt);

  // Go through child nodes to find the first useful text
  let ret = "";
  Array.some(node.childNodes, function(child) {
    ret = getTextContent(child);
    if (ret != "")
      return true;
    return false;
  });
  return ret;
}

// Get something that is host-y-ish
function hosty(URI, noPort) {
  try {
    return noPort ? URI.host : URI.hostPort;
  }
  catch(ex) {}

  // Some URIs don't have a host, so fallback to path
  return URI.path;
}

// Checks if a term matches on a word boundary
function matchesBoundary(term, target, casedTarget) {
  // Nothing left to do if the term doesn't show up in the rest of the target
  let pos = target.indexOf(term);
  if (pos == -1)
    return false;

  // Matching at the very beginning is a boundary success
  if (pos == 0)
    return true;

  // Otherwise, check if a middle-match is a boundary match
  do {
    // If the matching position's character is lowercase
    let at = casedTarget.charCodeAt(pos);
    if (at >= 97 && at <= 122) {
      // We're good as long as the character before is not a letter
      let prev = casedTarget.charCodeAt(pos - 1);
      if (prev < 65 || (prev > 90 && prev < 97) || prev > 122)
        return true;

      // Otherwise, continue after where it matched
      pos = target.indexOf(term, pos + 1);
      continue;
    }
    // If the matching position's character is uppercase
    else if (at >= 65 && at <= 90) {
      // We're good as long as the character before is not uppercase
      let prev = casedTarget.charCodeAt(pos - 1);
      if (prev < 65 || prev > 90)
        return true;

      // Otherwise, continue after where it matched
      pos = target.indexOf(term, pos + 1);
      continue;
    }

    // Must not have been a letter, so it's a word boundary!
    return true;

  // Keep searching until the term doesn't show up, then it must not match
  } while (pos != -1);
  return false;
}

// Get both the original-case and lowercase prepared text
function prepareMatchText(text) {
  // Arbitrarily only search through the first 50 characters
  text = stripPrefix(text).slice(0, 50);
  return [text, text.toLowerCase()];
}

// Check if a query string matches some page information
function queryMatchesPage(query, {title, url}) {
  // Just short circuit if it's the empty query
  if (query == "")
    return true;

  // Use a cached query parts instead of processing each time
  let {lastQuery, queryParts} = queryMatchesPage;
  if (query != lastQuery) {
    // Remember what the cached data is used for
    queryMatchesPage.lastQuery = query;
    queryParts = queryMatchesPage.queryParts = [];

    // Get rid of prefixes and identify each term's case-ness
    stripPrefix(query).split(/\s+/).forEach(function(part) {
      // NB: Add the term to the front, so the last term is processed first as
      // it will fail-to-match faster than earlier terms that already matched
      // when doing an incremental search.
      queryParts.unshift({
        ignoreCase: part == part.toLowerCase(),
        term: part
      });
    });
  }

  // Fix up both the title and url in preparation for searching
  let [title, lowerTitle] = prepareMatchText(title);
  let [url, lowerUrl] = prepareMatchText(url);

  // Make sure every term in the query matches
  return queryParts.every(function({ignoreCase, term}) {
    // For case insensitive terms, match against the lowercase text
    if (ignoreCase) {
      return matchesBoundary(term, lowerTitle, title) ||
             matchesBoundary(term, lowerUrl, url);
    }

    // For case sensitive terms, just use the original casing text
    return matchesBoundary(term, title, title) ||
           matchesBoundary(term, url, url);
  });
}

// Remove common protocol and subdomain prefixes
function stripPrefix(text) {
  return text.replace(/^(?:(?:ftp|https?):\/{0,2})?(?:ftp|w{3}\d*)?\.?/, "");
}

// Get a upper-case-first-of-word string from an array of strings
function upperFirst(strArray) {
  return strArray.map(function(part) {
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join(" ");
}
