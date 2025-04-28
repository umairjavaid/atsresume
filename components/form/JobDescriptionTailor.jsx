import React, { useContext, useState } from "react";
import { ResumeContext } from "../../pages/builder";
import { FaWandMagicSparkles, FaSave, FaTrash } from "react-icons/fa6";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";

const JobDescriptionTailor = () => {
  const { resumeData, setResumeData } = useContext(ResumeContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [saveVersionName, setSaveVersionName] = useState("");
  const [showSavedVersions, setShowSavedVersions] = useState(false);

  const handleLlmConfigChange = (e) => {
    const { name, value } = e.target;

    setResumeData((prevData) => {
      const updatedConfig = {
        ...prevData.llmConfig,
        [name]: value,
      };

      if (name === "provider" && (!prevData.llmConfig.apiUrl || prevData.llmConfig.apiUrl.trim() === "")) {
        if (value === "anthropic") {
          updatedConfig.apiUrl = "/api/anthropic";
        } else if (value === "openai") {
          updatedConfig.apiUrl = "/api/openai";
        } else {
          updatedConfig.apiUrl = "/api/llm";
        }
      }

      return {
        ...prevData,
        llmConfig: updatedConfig,
      };
    });
  };

  const handleJdChange = (e) => {
    setResumeData((prevData) => ({
      ...prevData,
      jobDescription: e.target.value,
    }));
  };

  const handleInstructionChange = (e) => {
    setResumeData((prevData) => ({
      ...prevData,
      instructionPrompt: e.target.value,
    }));
  };

  const extractJson = (text) => {
    console.log("Raw LLM response:", text.substring(0, 500) + "..."); // Log the beginning of the response
    
    // First try: Look for JSON code block in markdown format with ```json tag
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const jsonBlockMatch = text.match(jsonBlockRegex);
    
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch (parseError) {
        console.error("Failed to parse JSON from code block:", parseError);
        // Store the JSON text for potential cleanup
        const jsonText = jsonBlockMatch[1];
        try {
          // Try to clean up common JSON syntax issues
          const cleanedJson = cleanupJsonString(jsonText);
          return JSON.parse(cleanedJson);
        } catch (cleanupError) {
          console.error("Failed to parse JSON even after cleanup:", cleanupError);
          // Continue to next method rather than failing immediately
        }
      }
    }
    
    // Second try: Look for JSON anywhere in the response
    try {
      // Try to find JSON object patterns - anything between { and } including all nested content
      const jsonPattern = /{[\s\S]*}/;
      const jsonMatch = text.match(jsonPattern);
      
      if (jsonMatch) {
        const jsonText = jsonMatch[0];
        console.log("Attempting to parse JSON:", jsonText.substring(0, 200) + "...");
        try {
          return JSON.parse(jsonText);
        } catch (parseError) {
          console.error("JSON parse error:", parseError.message);
          // Log problematic area
          const errorPos = findErrorPosition(parseError.message);
          if (errorPos) {
            const startPos = Math.max(0, errorPos - 20);
            const endPos = Math.min(jsonText.length, errorPos + 20);
            console.error(`JSON error context: "${jsonText.substring(startPos, endPos)}"`);
          }
          
          // Try to clean up and parse again
          const cleanedJson = cleanupJsonString(jsonText);
          return JSON.parse(cleanedJson);
        }
      }
    } catch (parseError) {
      console.error("Failed to parse JSON from pattern matching:", parseError);
    }
    
    // Third try: Check if the entire response is valid JSON
    try {
      const trimmedText = text.trim();
      if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
        try {
          return JSON.parse(trimmedText);
        } catch (parseError) {
          // Try with cleanup
          const cleanedJson = cleanupJsonString(trimmedText);
          return JSON.parse(cleanedJson);
        }
      }
    } catch (finalError) {
      console.error("Failed to parse entire response as JSON:", finalError);
    }
    
    setError("Could not extract valid JSON from the LLM response. The model may have returned malformed JSON.");
    return null;
  };

  // Helper function to find position mentioned in JSON parse error
  const findErrorPosition = (errorMessage) => {
    const posMatch = errorMessage.match(/position (\d+)/);
    if (posMatch && posMatch[1]) {
      return parseInt(posMatch[1], 10);
    }
    return null;
  };

  // Helper function to attempt cleaning up common JSON syntax issues
  const cleanupJsonString = (jsonString) => {
    let cleaned = jsonString;
    
    // Replace single quotes with double quotes (but not inside already quoted strings)
    cleaned = cleaned.replace(/(\w+)'/g, '$1"');
    cleaned = cleaned.replace(/'(\w+)/g, '"$1');
    
    // Fix trailing commas in arrays and objects
    cleaned = cleaned.replace(/,\s*\}/g, '}');
    cleaned = cleaned.replace(/,\s*\]/g, ']');
    
    // Fix missing commas between array elements or object properties
    cleaned = cleaned.replace(/}\s*{/g, '},{');
    cleaned = cleaned.replace(/]\s*\[/g, '],[');
    cleaned = cleaned.replace(/}\s*\[/g, '},[');
    cleaned = cleaned.replace(/]\s*{/g, '],[');
    
    // Remove JavaScript comments
    cleaned = cleaned.replace(/\/\/.*$/gm, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Fix malformed keyAchievements strings that have unescaped newlines or quotes
    const fixKeyAchievements = (match) => {
      // Replace actual newlines with \\n in key achievements 
      let fixed = match.replace(/\n/g, '\\n');
      // Escape unescaped quotes
      fixed = fixed.replace(/(?<!\\)"/g, '\\"');
      return fixed;
    };
    
    // Look for keyAchievements patterns and fix them
    const keyAchPattern = /"keyAchievements"\s*:\s*"(.*?)(?<!\\)"/gs;
    cleaned = cleaned.replace(keyAchPattern, (match, content) => {
      return `"keyAchievements":"${fixKeyAchievements(content)}"`;
    });
    
    console.log("Cleaned JSON:", cleaned.substring(0, 200) + "...");
    return cleaned;
  };

  const callLlmApi = async (prompt) => {
    setIsLoading(true);
    setError(null);

    // Update the prompt to more explicitly request valid JSON
    const enhancedPrompt = `${prompt}\n\nVERY IMPORTANT: Your response MUST be a single, valid JSON object inside a code block. Format it exactly like this:\n\`\`\`json\n{\n  "key": "value",\n  "array": [1, 2, 3]\n}\n\`\`\`\nEnsure all JSON is valid with: proper quotes around keys and string values, commas between elements (but not after the last element), and properly escaped strings. Do not include any explanation text outside the JSON code block.`;

    const { provider, model, max_tokens, temperature, systemPrompt } = resumeData.llmConfig;

    if (provider === "simulate") {
      console.log("--- SIMULATION MODE ---");
      console.log("Prompt:", enhancedPrompt);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsLoading(false);
      const simulatedJsonResponse = JSON.stringify({
        ...resumeData,
        summary: "This is a *simulated* tailored summary based on the job description.",
        workExperience: resumeData.workExperience.map(exp => ({
          ...exp,
          keyAchievements: exp.keyAchievements + "\n- Simulated achievement point."
        }))
      });
      return simulatedJsonResponse;
    }

    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: enhancedPrompt }],
          max_tokens,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API error: ${response.status} ${errorData}`);
      }

      const data = await response.json();
      
      // Extract the response text based on provider
      let responseText = '';
      if (provider === 'anthropic') {
        // Anthropic returns content directly in this format
        responseText = data.content;
      } else if (provider === 'openai') {
        // OpenAI response might be in a different format
        responseText = data.content?.[0]?.text || data.choices?.[0]?.message?.content;
      } else {
        // Generic fallback for other providers
        responseText = data.content?.[0]?.text || data.content || JSON.stringify(data);
      }

      if (!responseText) {
        console.error("Response data structure:", JSON.stringify(data, null, 2));
        throw new Error("LLM response format unexpected or empty.");
      }

      const tailoredData = extractJson(responseText);
      
      if (tailoredData) {
        setResumeData(prevData => ({
          ...tailoredData,
          llmConfig: prevData.llmConfig,
          jobDescription: prevData.jobDescription,
          instructionPrompt: prevData.instructionPrompt,
          savedResumes: prevData.savedResumes,
          profilePicture: prevData.profilePicture,
          name: tailoredData.name ?? prevData.name,
          position: tailoredData.position ?? prevData.position,
          contactInformation: tailoredData.contactInformation ?? prevData.contactInformation,
          email: tailoredData.email ?? prevData.email,
          address: tailoredData.address ?? prevData.address,
          socialMedia: tailoredData.socialMedia ?? prevData.socialMedia,
          education: tailoredData.education ?? prevData.education,
          skills: tailoredData.skills ?? prevData.skills,
          languages: tailoredData.languages ?? prevData.languages,
          certifications: tailoredData.certifications ?? prevData.certifications,
        }));
      }
    } catch (err) {
      console.error("Error tailoring resume:", err);

      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError(`Network error: Could not connect to API at "/api/llm". Please check your network connection and API URL configuration.`);
      } else if (err.name === 'SyntaxError') {
        setError(`Invalid response format: ${err.message}`);
      } else {
        setError(`Error: ${err.message}`);
      }

      if (confirm("API request failed. Would you like to try simulation mode instead?")) {
        setResumeData(prevData => ({
          ...prevData,
          llmConfig: {
            ...prevData.llmConfig,
            provider: "simulate"
          }
        }));

        setTimeout(() => callLlmApi(prompt), 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const tailorResume = () => {
    const { userPromptTemplate } = resumeData.llmConfig;
    const { jobDescription } = resumeData;

    if (!jobDescription) {
      setError("Please paste the job description first.");
      return;
    }

    const resumeForLlm = { ...resumeData };
    delete resumeForLlm.llmConfig;
    delete resumeForLlm.jobDescription;
    delete resumeForLlm.instructionPrompt;
    delete resumeForLlm.savedResumes;

    const prompt = userPromptTemplate
      .replace("{resume}", JSON.stringify(resumeForLlm, null, 2))
      .replace("{job_description}", jobDescription);

    callLlmApi(prompt);
  };

  const refineResume = () => {
    const { refinePromptTemplate } = resumeData.llmConfig;
    const { instructionPrompt } = resumeData;

    if (!instructionPrompt) {
      setError("Please enter refinement instructions first.");
      return;
    }

    const resumeForLlm = { ...resumeData };
    delete resumeForLlm.llmConfig;
    delete resumeForLlm.jobDescription;
    delete resumeForLlm.instructionPrompt;
    delete resumeForLlm.savedResumes;

    const prompt = refinePromptTemplate
      .replace("{resume}", JSON.stringify(resumeForLlm, null, 2))
      .replace("{instruction}", instructionPrompt);

    callLlmApi(prompt);
  };

  const saveResumeVersion = () => {
    if (!saveVersionName.trim()) {
      setError("Please enter a name for this resume version.");
      return;
    }

    const resumeToSave = { ...resumeData };

    const newSavedResume = {
      name: saveVersionName,
      timestamp: new Date().toISOString(),
      jobDescription: resumeData.jobDescription,
      data: resumeToSave
    };

    setResumeData(prevData => ({
      ...prevData,
      savedResumes: [...(prevData.savedResumes || []), newSavedResume]
    }));

    setSaveVersionName("");
    setError(null);
  };

  const loadResumeVersion = (versionIndex) => {
    const versionToLoad = resumeData.savedResumes[versionIndex];

    if (!versionToLoad) {
      setError("Failed to load saved version.");
      return;
    }

    const currentSavedResumes = [...resumeData.savedResumes];
    const currentLlmConfig = { ...resumeData.llmConfig };

    setResumeData({
      ...versionToLoad.data,
      savedResumes: currentSavedResumes,
      llmConfig: currentLlmConfig
    });

    setError(null);
  };

  const deleteResumeVersion = (versionIndex, e) => {
    e.stopPropagation();

    const updatedVersions = [...resumeData.savedResumes];
    updatedVersions.splice(versionIndex, 1);

    setResumeData(prevData => ({
      ...prevData,
      savedResumes: updatedVersions
    }));
  };

  return (
    <div className="flex-col-gap-2 mb-4 p-4 border border-dashed border-gray-300 rounded bg-fuchsia-700/30">
      <div className="flex justify-between items-center">
        <h2 className="input-title text-white flex items-center gap-2">
          <FaWandMagicSparkles /> AI Resume Tailor
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowSavedVersions(!showSavedVersions)}
            className="text-xs text-white underline hover:text-fuchsia-200 flex items-center"
            title="Toggle Saved Versions"
          >
            {showSavedVersions ? 'Hide Versions' : 'Saved Versions'} 
            {resumeData.savedResumes?.length > 0 && ` (${resumeData.savedResumes.length})`}
          </button>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs text-white underline hover:text-fuchsia-200 flex items-center"
            title="Toggle LLM Configuration"
          >
            {showConfig ? 'Hide Config' : 'Show Config'}
          </button>
        </div>
      </div>

      {showSavedVersions && (
        <div className="mt-2 bg-fuchsia-800/50 rounded p-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">Saved Resume Versions</h3>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Version name..."
                value={saveVersionName}
                onChange={(e) => setSaveVersionName(e.target.value)}
                className="px-2 py-1 text-xs rounded bg-fuchsia-900/50 text-white w-40"
              />
              <button
                type="button"
                onClick={saveResumeVersion}
                className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1"
                title="Save current resume version"
              >
                <FaSave size={12} /> Save
              </button>
            </div>
          </div>
          
          {resumeData.savedResumes?.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {resumeData.savedResumes.map((version, index) => (
                <div 
                  key={index}
                  onClick={() => loadResumeVersion(index)}
                  className="flex justify-between items-center p-2 text-xs text-white bg-fuchsia-900/30 hover:bg-fuchsia-900/50 mb-1 rounded cursor-pointer"
                >
                  <div>
                    <div className="font-medium">{version.name}</div>
                    <div className="text-fuchsia-300 text-xs">
                      {new Date(version.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteResumeVersion(index, e)}
                    className="text-fuchsia-300 hover:text-white"
                    title="Delete this version"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-fuchsia-300 text-xs italic">No saved versions yet. Tailor your resume and save versions for different job applications.</p>
          )}
        </div>
      )}

      {showConfig && (
        <div className="flex-col-gap-2 p-3 bg-fuchsia-800/50 rounded mt-2">
          <h3 className="text-sm font-semibold text-white mb-1">LLM Configuration</h3>
          <label className="text-xs text-white block">Provider:</label>
          <select
            name="provider"
            value={resumeData.llmConfig.provider}
            onChange={handleLlmConfigChange}
            className="w-full other-input text-sm"
          >
            <option value="simulate">Simulate (No API call)</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI GPT</option>
          </select>

          <label className="text-xs text-white block">Model:</label>
          <input
            type="text"
            name="model"
            placeholder={resumeData.llmConfig.provider === "anthropic" ? "claude-3-haiku-20240307" : "gpt-4o"}
            value={resumeData.llmConfig.model || ""}
            onChange={handleLlmConfigChange}
            className="w-full other-input text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-white block">Max Tokens:</label>
              <input
                type="number"
                name="max_tokens"
                placeholder="1024"
                value={resumeData.llmConfig.max_tokens || ""}
                onChange={handleLlmConfigChange}
                className="w-full other-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-white block">Temperature:</label>
              <input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="1"
                placeholder="0.5"
                value={resumeData.llmConfig.temperature || ""}
                onChange={handleLlmConfigChange}
                className="w-full other-input text-sm"
              />
            </div>
          </div>

          <label className="text-xs text-white block">API URL (Backend Proxy):</label>
          <input
            type="text"
            name="apiUrl"
            value={resumeData.llmConfig.apiUrl}
            onChange={handleLlmConfigChange}
            className="w-full other-input text-sm"
            placeholder="/api/llm"
          />
        </div>
      )}

      <textarea
        placeholder="Paste Job Description Here..."
        name="jobDescription"
        className="w-full other-input h-24"
        value={resumeData.jobDescription}
        onChange={handleJdChange}
      />
      <button
        type="button"
        onClick={tailorResume}
        disabled={isLoading || !resumeData.jobDescription}
        className={`p-2 text-white rounded w-full ${
          isLoading || !resumeData.jobDescription
            ? "bg-gray-500 cursor-not-allowed"
            : "bg-fuchsia-700 hover:bg-fuchsia-800"
        }`}
      >
        {isLoading ? "Tailoring..." : "Tailor Resume to Job Description"}
      </button>

      <textarea
        placeholder="Enter Refinement Instructions (e.g., 'Make the summary more concise', 'Emphasize project management skills')..."
        name="instructionPrompt"
        className="w-full other-input h-16 mt-2"
        value={resumeData.instructionPrompt}
        onChange={handleInstructionChange}
      />
      <button
        type="button"
        onClick={refineResume}
        disabled={isLoading || !resumeData.instructionPrompt}
        className={`p-2 text-white rounded w-full ${
          isLoading || !resumeData.instructionPrompt
            ? "bg-gray-500 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {isLoading ? "Refining..." : "Refine Resume"}
      </button>

      {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
    </div>
  );
};

export default JobDescriptionTailor;