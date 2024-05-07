async function getArtifactLink(artifactName, owner, repo, run_id) {
    // get the list of artifacts
    const artifacts = await github.paginate(
        github.rest.actions.listWorkflowRunArtifacts, {owner, repo, run_id}
    );

    if (!artifacts.length) {
        return core.error(`No artifacts found`);
    }

    for (const artifact of artifacts) {
        if (artifact.name == artifactName) {
            return `https://nightly.link/${owner}/${repo}/actions/artifacts/${artifact.id}.zip`;
        }
    }
    return core.error(`failed to find ${artifactName} artifact`);
}

const {owner, repo} = context.repo;
const run_id = ${{github.event.workflow_run.id}};
const workflow_name = "${{github.event.workflow_run.name}}";

console.info(`${workflow_name} triggered this run`)

// Find the PR with the right sha, see https://github.com/orgs/community/discussions/25220
const response = await github.rest.search.issuesAndPullRequests({
    q: 'repo:${{ github.repository }} is:pr sha:${{ github.event.workflow_run.head_sha }}',
    per_page: 1,
})

const items = response.data.items
if (items.length < 1) {
    return core.error("No matching pull requests found");
}

const pull_number = items[0].number;
console.info("Pull request number is", pull_number)

if (workflow_name == 'Documentation') {
    const link = await getArtifactLink('docs', owner, repo, run_id);
    const key = docs;
    // Add horizontal line for docs only because assuming this is one
    // triggered first. The wheels building should take much longer...
    const body_message = `\n----\n 📖 [Download documentation](${link})\n`;
} else { // wheels
    const link = await getArtifactLink('wheels', owner, repo, run_id);
    const key = wheels;
    const body_message = `⚙️ [Download wheels](${link})\n`;
}

const MESSAGE_SEPARATOR_START = `\r\n\r\n<!-- download-section ${key} start -->\r\n`;
const MESSAGE_SEPARATOR_END = `\r\n<!-- download-section ${key} end -->`;

const { data: pull } = await github.rest.pulls.get({
    owner: owner,
    repo: repo,
    pull_number: pull_number,
});

let body = "";
if (pull.body) {
    if (pull.body.indexOf(MESSAGE_SEPARATOR_START) === -1) {
        // First time updating this description
        body = pull.body + MESSAGE_SEPARATOR_START + body_message + MESSAGE_SEPARATOR_END;
    }
    else {
        // we already updated this description before
        body = pull.body.slice(0, pull.body.indexOf(MESSAGE_SEPARATOR_START));
        body = body + MESSAGE_SEPARATOR_START + body_message + MESSAGE_SEPARATOR_END;
        body = body + pull.body.slice(pull.body.indexOf(MESSAGE_SEPARATOR_END) + MESSAGE_SEPARATOR_END.length);
    }
}
else {
    // Pull Request description is empty
    body = MESSAGE_SEPARATOR_START + body_message + MESSAGE_SEPARATOR_END;
}

github.rest.pulls.update({
    owner: owner,
    repo: repo,
    pull_number: pull_number,
    body: body,
});