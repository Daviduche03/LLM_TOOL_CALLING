import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";

const start_time = Date.now();
const endpoint = "https://polite-ground-030dc3103.4.azurestaticapps.net/api/v1";
const azureApiKey = " YOUR API KEY HERE";
const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));


//ANY LLM CAN BE USED BASICALLY, YOU CAN JUST FLIP Things

const deploymentId = "gpt-35-turbo";
const webSearch = new TavilySearchResults({
  maxResults: 1,
  apiKey: "tvly-",
});

class ToolManager {
  static tools = {
    getTextLength: {
      description: "Get the length of a string, argument should be a string",
      func: async (word) => word.length,
    },
    tavily_search: {
      description:
        "Search the web for information about a topic. The argument should be a string.",
      func: async (arg) => await webSearch._call(arg),
    },
  };
  static messageHistory = [];

  static async runTool(toolName, arg) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found.`);
    }

    if (typeof tool.func !== "function") {
      throw new Error(`Invalid tool function: ${toolName}`);
    }

    return await tool.func(arg);
  }
}

const tools = ToolManager.tools;

const prompt = `
Given a user query or context, determine whether the LLM needs to use a tool to complete the query.

If the LLM needs to use a tool, identify the tool argument from the query. Provide the tool name for the tool if it needs to be used, and extract the value for the argument from the query.

If the LLM does not need to use a tool, Return an actual response from you if no tool is required in the expected json format..

The output should be in JSON format, with the key as the tool name and the value as the value of the argument for that tool. Return an actual response from you if no tool is required in the expected json format.

Example:
Given the query "Get the length of 'Do other Azure AI services support this too'", when a tool is required, the output should be:
{
  "response": {
    "tool": "getTextLength",
    "tool_call_id": "tool_call_id",
    "arg": "Do other Azure AI services support this too",
    "arg_type": "string" | "json" (can be json if tool is multi-argument)
  },
  'tool_required': true
}

When a tool is not required, the output should be:
{
  'response': '{an actual response from you}',
  'tool_required': false
}

This is the tool you have access to:
tool: ${JSON.stringify(tools)}
`;

const messages = [
  { role: "system", content: prompt },
  { role: "user", content: "search the web for developers in python" },
];

async function getInitialResponse(userMessage) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: userMessage },
  ];

  const result = await client.getChatCompletions(deploymentId, messages);
  return result.choices[0].message.content;
}

async function invokeTools(parsedResponse, userMessage) {
  if (parsedResponse.tool_required) {
    try {
      const result = await ToolManager.runTool(
        parsedResponse.response.tool,
        parsedResponse.response.arg
      );
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error) {
      console.error(error.message);
    }
  } else {
    return parsedResponse.response;
  }
}

async function main(userMessage) {
  try {
    const initialResponse = await getInitialResponse(userMessage);

    console.log(initialResponse);
    const parsedContent = JSON.parse(initialResponse);
    const result = await invokeTools(parsedContent, userMessage);

    console.log(result);

    ToolManager.messageHistory.push(
      {
        role: "user",
        content: userMessage,
      },
      {
        role: "tool_call_result",
        content: result,
      }
    );

    const runHistory = JSON.stringify(ToolManager.messageHistory);

    const prompt = `
    You're a friendly AI assistant that reponds to users query in a responsible and conversational way. the reponse should be based of previous conversation history to enable smarter responses. remember you have access to tools and when used you wwill be provided with the tool call result, use  it to respond to the user.

    message history: ${runHistory}
    `;

    const messages = [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
    ];
    const finalResponse = await client.getChatCompletions(
      deploymentId,
      messages
    );
    console.log(finalResponse.choices[0].message.content);

    ToolManager.messageHistory.push({
      role: "AI",
      content: finalResponse.choices[0].message.content,
    });
  } catch (error) {
    console.error("Error in main:", error);
  } finally {
    console.log("Total time:", (Date.now() - start_time) / 1000, "seconds");
  }
}

main("can you search the web for email leads and return me their emails ").catch((err) => {
  console.error("The sample encountered an error:", err);
});
