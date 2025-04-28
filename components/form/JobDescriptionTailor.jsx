import React, { useContext, useState } from "react";
import { ResumeContext } from "../../pages/builder";
import { FaWandMagicSparkles } from "react-icons/fa6";

const JobDescriptionTailor = () => {
  const { resumeData, setResumeData } = useContext(ResumeContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  const handleLlmConfigChange = (e) => {
    const { name, value } = e.target;
    setResumeData((prevData) => ({
      ...prevData,
      llmConfig: {
        ...prevData.llmConfig,
        [name]: value,
      },
    }));
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
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (parseError) {
        console.error("Failed to parse extracted JSON:", parseError);
        setError("LLM response contained invalid JSON.");
        return null;
      }
    }
    setError("Could not find JSON block in the LLM response.");
    return null;
  };

  const callLlmApi = async (prompt) => {
    setIsLoading(true);
    setError(null);

    const { provider, apiUrl, model, max_tokens, temperature, systemPrompt } = resumeData.llmConfig;
    const currentApiUrl = apiUrl;

    if (provider === "simulate") {
      console.log("--- SIMULATION MODE ---");
      console.log("API URL:", currentApiUrl);
      console.log("Prompt:", prompt);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsLoading(false);
      const simulatedJsonResponse = JSON.stringify({
        ...resumeData,
        summary: "This is a *simulated* tailored summary based on the job description.",
        workExperience: resumeData.workExperience.map(exp => ({
          ...exp,
          keyAchievements: exp.keyAchievements + "\n- Simulated achievement point."
        }))
      }, null, 2);
      const simulatedResponseText = `\`\`\`json\n${simulatedJsonResponse}\n\`\`\``;
      const tailoredData = extractJson(simulatedResponseText);
      if (tailoredData) {
        setResumeData(tailoredData);
      } else {
        setError(prev => prev || "Simulation failed to produce valid JSON.");
      }
      return;
    }

    const payload = {
      model: model || "claude-3-haiku-20240307",
      max_tokens: max_tokens || 1024,
      temperature: temperature || 0.5,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    };

    try {
      const response = await fetch(currentApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to parse error response." }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.content?.[0]?.text;

      if (!responseText) {
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
      setError(`Error: ${err.message}`);
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

  return (
    <div className="flex-col-gap-2 mb-4 p-4 border border-dashed border-gray-300 rounded bg-fuchsia-700/30">
      <div className="flex justify-between items-center">
        <h2 className="input-title text-white flex items-center gap-2">
          <FaWandMagicSparkles /> AI Resume Tailor
        </h2>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs text-white underline hover:text-fuchsia-200"
          title="Toggle LLM Configuration"
        >
          {showConfig ? 'Hide Config' : 'Show Config'}
        </button>
      </div>

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
            <option value="anthropic">Anthropic (via backend)</option>
          </select>

          <label className="text-xs text-white block">Model:</label>
          <input
            type="text"
            name="model"
            placeholder="e.g., claude-3-haiku-20240307"
            value={resumeData.llmConfig.model || ""}
            onChange={handleLlmConfigChange}
            className="w-full other-input text-sm"
          />

          <label className="text-xs text-white block">API URL (Backend Proxy):</label>
          <input
            type="text"
            name="apiUrl"
            value={resumeData.llmConfig.apiUrl}
            readOnly
            className="w-full other-input text-sm bg-gray-600 text-gray-300 cursor-not-allowed"
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
        {isLoading ? "Tailoring..." : "Tailor Resume to JD"}
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