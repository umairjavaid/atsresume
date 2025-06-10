import React, { useContext, useState } from "react";
import { ResumeContext } from "../../pages/builder";
import { FaWandMagicSparkles, FaSave, FaTrash } from "react-icons/fa6";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import JSON5 from 'json5';

const JobDescriptionTailor = () => {
  const { resumeData, setResumeData } = useContext(ResumeContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [saveVersionName, setSaveVersionName] = useState("");
  const [showSavedVersions, setShowSavedVersions] = useState(false);
  const [jsonDiagnostics, setJsonDiagnostics] = useState(null);
  const [progressStage, setProgressStage] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [sectionProgress, setSectionProgress] = useState({});
  const [currentSection, setCurrentSection] = useState(null);

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

  const handleLlmConfigChange = (e) => {
    const { name, value } = e.target;

    setResumeData((prevData) => {
      const currentConfig = prevData.llmConfig || {};
      
      const updatedConfig = {
        ...currentConfig,
        [name]: value,
      };

      if (name === "provider" && (!currentConfig.apiUrl || currentConfig.apiUrl.trim() === "")) {
        updatedConfig.apiUrl = "/api/llm";
      }

      return {
        ...prevData,
        llmConfig: updatedConfig,
      };
    });
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

  const prepareResumeForLlm = (originalData) => {
    const optimizedData = JSON.parse(JSON.stringify(originalData));
    
    delete optimizedData.llmConfig;
    delete optimizedData.jobDescription;
    delete optimizedData.instructionPrompt;
    delete optimizedData.savedResumes;
    
    if (optimizedData.profilePicture && optimizedData.profilePicture.length > 1000) {
      optimizedData.profilePicture = "";
    }
    
    return optimizedData;
  };

  const callLlmApiWithRetry = async (prompt, maxRetries = 1, initialDelay = 1000) => {
    let attempt = 0;
    let delay = initialDelay;
    let lastError = null;

    while (attempt < maxRetries) {
      try {
        setProgressMessage(`${attempt > 0 ? `Retry ${attempt}/${maxRetries}: ` : ''}Processing request...`);
        const response = await callLlmForSection(prompt);
        console.log("LLM response received, length:", response?.length || 0);
        return response;
      } catch (error) {
        lastError = error;
        attempt++;
        setRetryCount(attempt);
        console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
        
        const isOverloaded = error.message && (
          error.message.includes('overloaded') || 
          error.message.includes('rate_limit') || 
          error.message.includes('429')
        );
        
        if (attempt >= maxRetries) {
          setProgressMessage(`API request failed. Error: ${error.message}`);
          throw error;
        }
        
        if (!isOverloaded) {
          setProgressMessage(`API error: ${error.message}. Not retrying for non-overload errors.`);
          throw error;
        }
        
        const jitter = Math.random() * 0.3 + 0.85;
        delay = Math.min(delay * 2 * jitter, 5000);
        
        setProgressMessage(`Service overloaded. Retry ${attempt}/${maxRetries} in ${Math.round(delay/1000)}s... (${error.message})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  };

  const callLlmForSection = async (prompt) => {
    const { provider, model, max_tokens, temperature, systemPrompt } = resumeData.llmConfig || {};
    
    // Default provider if not set
    const effectiveProvider = provider || "anthropic";
    
    // Valid model lists
    const validAnthropicModels = [
      "claude-3-haiku-20240307",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-2.1", 
      "claude-2.0",
      "claude-instant-1.2"
    ];
    
    const validOpenAIModels = [
      "gpt-4o",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "text-davinci-003"
    ];
    
    // Clean up model name (trim spaces) and validate against known models
    let effectiveModel;
    if (effectiveProvider === "anthropic") {
      // Trim any whitespace from the model name
      const trimmedModel = model?.trim();
      // Check if it's a valid Anthropic model
      if (trimmedModel && validAnthropicModels.some(m => trimmedModel.startsWith(m))) {
        effectiveModel = trimmedModel;
      } else {
        // Default to a known good model
        effectiveModel = "claude-3-haiku-20240307";
      }
    } else {
      // For OpenAI
      const trimmedModel = model?.trim();
      if (trimmedModel && validOpenAIModels.some(m => trimmedModel.startsWith(m))) {
        effectiveModel = trimmedModel;
      } else {
        effectiveModel = "gpt-3.5-turbo";
      }
    }

    try {
      console.log(`Using ${effectiveProvider} with model: '${effectiveModel}'`);
      
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: effectiveProvider,
          model: effectiveModel,
          system: systemPrompt || "You are a professional resume tailoring assistant. Provide concise, targeted content for the specific resume section.",
          messages: [{ role: 'user', content: prompt }],
          max_tokens,
          temperature,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        let parsedError;
        try {
          parsedError = JSON.parse(errorData);
        } catch (e) {
          parsedError = { message: errorData };
        }
        
        const errorMessage = parsedError.message || errorData;
        if (errorMessage.includes('API key') || response.status === 401) {
          const error = new Error(`API key error: ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key is invalid or missing. Please set up your API key in the environment variables.`);
          error.status = response.status;
          error.type = 'API_KEY_ERROR';
          throw error;
        }
        
        const error = new Error(`API error: ${response.status} ${errorData}`);
        error.status = response.status;
        error.type = parsedError.type || 'UNKNOWN_ERROR';
        throw error;
      }
      
      const data = await response.json();
      return extractResponseText(data, provider);
    } catch (error) {
      console.error("Error calling LLM for section:", error);
      throw error;
    }
  };

  const extractResponseText = (data, provider) => {
    try {
      if (provider === 'anthropic') {
        return data.content || "";
      } else if (provider === 'openai') {
        return data.content?.[0]?.text || data.choices?.[0]?.message?.content || "";
      } else {
        return data.content?.[0]?.text || data.content || JSON.stringify(data);
      }
    } catch (error) {
      console.error("Error extracting response text:", error);
      return data.toString();
    }
  };

  const createSectionPrompt = (sectionType, sectionContent, jobDescription) => {
    const basePrompt = `Given the following job description:\n\n${jobDescription}\n\n`;
    
    switch(sectionType) {
      case "summary":
        return `${basePrompt}Please tailor this professional summary to highlight skills and qualifications relevant to the job description:\n\n${sectionContent}\n\nProvide only the refined summary text.`;
      
      case "workExperience":
        return `${basePrompt}Please tailor this work experience to highlight achievements and responsibilities relevant to the job description:\n\nCompany: ${sectionContent.company}\nPosition: ${sectionContent.position}\nDescription: ${sectionContent.description || ''}\nKey Achievements: ${sectionContent.keyAchievements || ''}\n\nProvide the tailored description and key achievements, keeping the same format. Maintain bullet points for key achievements.`;
      
      case "projects":
        return `${basePrompt}Please tailor this project description to highlight skills and accomplishments relevant to the job description:\n\nProject: ${sectionContent.name}\nDescription: ${sectionContent.description || ''}\nKey Achievements: ${sectionContent.keyAchievements || ''}\n\nProvide the tailored description and key achievements, keeping the same format. Maintain bullet points for key achievements.`;
      
      case "skills":
        return `${basePrompt}Given these skills:\n\n${sectionContent.join(", ")}\n\nPlease provide a refined list of skills that match the job description requirements. Only include skills from the original list that are relevant to the job. Return as a comma-separated list of skills.`;
      
      case "languages":
        return `${basePrompt}Given these languages:\n\n${sectionContent.join(", ")}\n\nPlease order these languages based on relevance to the job description. Return as a comma-separated list of languages, without adding new ones.`;
      
      case "certifications":
        return `${basePrompt}Given these certifications:\n\n${sectionContent.join(", ")}\n\nPlease order these certifications based on relevance to the job description. Return as a comma-separated list of certifications, without adding new ones.`;
      
      default:
        return `${basePrompt}Please tailor the following content to match the job description:\n\n${JSON.stringify(sectionContent, null, 2)}\n\nProvide only the refined content.`;
    }
  };

  const extractFromJson = (response, keyNames) => {
    if (!response) return null;
    
    try {
      let jsonContent = response;
      if (response.includes('```')) {
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonContent = jsonMatch[1].trim();
        }
      }
      
      let parsedData;
      try {
        parsedData = JSON.parse(jsonContent);
      } catch (e) {
        try {
          const fixedJson = jsonContent
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
            .replace(/'/g, '"');
          parsedData = JSON.parse(fixedJson);
        } catch (e2) {
          for (const key of keyNames) {
            const keyRegex = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i');
            const match = response.match(keyRegex);
            if (match && match[1]) {
              return match[1].trim();
            }
            
            const arrayRegex = new RegExp(`"${key}"\\s*:\\s*\\[(.*?)\\]`, 'i');
            const arrayMatch = response.match(arrayRegex);
            if (arrayMatch && arrayMatch[1]) {
              return arrayMatch[1].split(',')
                .map(item => item.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
            }
          }
        }
      }
      
      if (parsedData) {
        // If keyNames is an array, attempt to extract multiple keys
        if (Array.isArray(keyNames)) {
          const result = {};
          let foundKey = false;
          for (const key of keyNames) {
            if (parsedData[key] !== undefined) {
              result[key] = parsedData[key];
              foundKey = true;
            }
          }
          if (foundKey) {
            // If multiple keys were requested, return the object
            // If only one key was in keyNames array and found, this still returns an object: e.g. {description: "..."}
            return result;
          }
        } else if (keyNames && parsedData[keyNames] !== undefined) {
          // Original logic for single keyName string
          const value = parsedData[keyNames];
          if (Array.isArray(value)) {
            return value.map(item =>
              typeof item === 'string' ? item : JSON.stringify(item)
            );
          }
          return value;
        }
        
        // Fallback for when specific keys aren't found or if keyNames wasn't an array initially
        // This part tries to be smart if only one key was expected (not an array)
        // or if the multi-key extraction above didn't find anything.
        if (!Array.isArray(keyNames)) {
            // Try to find the single keyName if it wasn't an array
            if (parsedData[keyNames] !== undefined) return parsedData[keyNames];

            // Fallback to original behavior if the single keyName is not present
            // or if keyNames was not an array and not found.
            const values = Object.values(parsedData);
            if (values.length === 1) {
                const value = values[0];
                if (typeof value === 'string' || Array.isArray(value)) {
                    return value;
                }
            }
        }
        // If keyNames was an array but nothing was found, this will lead to fallback string.
        // Or if it was a single key string not found.
      }
    } catch (error) {
      console.error(`Error extracting data for keys "${keyNames}":`, error);
      // Log the response for debugging if parsing fails
      console.debug("Response causing parsing error:", response);
    }
    
    // Fallback: return the raw response (cleaned up) if JSON parsing or key extraction fails
    // This part should ideally be hit less often if LLM follows instructions.
    console.warn(`Falling back to string extraction for keys "${keyNames}". Response:`, response.substring(0, 200));
    // Ensure keyNames is an array for the join operation, even if a single string was passed.
    const keysForRegex = Array.isArray(keyNames) ? keyNames : [keyNames].filter(Boolean);
    if (keysForRegex.length === 0) return response.trim(); // Nothing to sensibly strip if no keynames

    return response
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/\{|\}/g, '')
      .replace(new RegExp(`"(?:${keysForRegex.join('|')})"\\s*:\\s*`, 'g'), '')
      .replace(/^["']|["']$/g, '')
      .trim();
  };

  const extractListItems = (response, label) => {
    if (!response) return null;
    
    if (response.includes('{') || response.includes('[') || response.includes('```json')) {
      const extractedItems = extractFromJson(response, ['skills', 'items', label.toLowerCase(), 'certifications']);
      if (extractedItems) {
        if (Array.isArray(extractedItems)) {
          return extractedItems.filter(item => item && typeof item === 'string' && item.length > 1);
        } else if (typeof extractedItems === 'string') {
          return extractedItems.split(',').map(item => item.trim()).filter(Boolean);
        }
      }
    }
    
    const items = response.split(',').map(item => item.trim()).filter(item => item);
    return items.length > 0 ? items : null;
  };

  const processCertifications = (tailoredCertifications) => {
    if (!tailoredCertifications) return null;
    
    const certPatterns = [
      /certified|certification|certificate|cert\b|exam|credential|qualification|diploma/i,
      /\b[A-Z]{2,6}[-–][A-Z0-9]{2,6}\b/,
      /Microsoft|AWS|Azure|Google|Oracle|Cisco|CompTIA|PMI|ITIL|Salesforce|Scrum|Agile|Six Sigma/i,
      /Professional|Specialist|Expert|Associate|Practitioner|Master|Foundation|Advanced/i,
      /\bCDP\b|\bCPM\b|\bPMP\b|\bCISM\b|\bCISSP\b|\bCEH\b|\bCCSP\b|\bAZ-\d{3}\b|\bAWS-\w+\b/
    ];
    
    const certificationList = [];
    
    if (tailoredCertifications.includes('{') || 
        tailoredCertifications.includes('[') || 
        tailoredCertifications.includes('```')) {
        
      try {
        const extracted = extractFromJson(tailoredCertifications, 
          ['certifications', 'certification', 'credentials', 'qualifications']);
          
        if (extracted) {
          if (Array.isArray(extracted)) {
            return extracted.filter(cert => 
              cert && typeof cert === 'string' && 
              (cert.length > 5 && !cert.includes(':')) &&
              (certPatterns.some(pattern => pattern.test(cert)) || cert.includes('Course') || cert.includes('Training'))
            );
          } else if (typeof extracted === 'string') {
            const splitCerts = extracted.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
            return splitCerts.filter(cert => 
              (cert.length > 5 && !cert.includes(':')) &&
              (certPatterns.some(pattern => pattern.test(cert)) || cert.includes('Course') || cert.includes('Training'))
            );
          }
        }
      } catch (error) {
        console.error("Error processing JSON certifications:", error);
      }
    }
    
    const candidates = tailoredCertifications
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(item => item.length > 5 && !item.includes(':'));
    
    for (const candidate of candidates) {
      if (certPatterns.some(pattern => pattern.test(candidate)) || 
          candidate.includes('Course') || 
          candidate.includes('Training')) {
        certificationList.push(candidate);
      }
    }
    
    if (certificationList.length === 0) {
      return [
        "Certified Professional in relevant technology",
        "Technical training relevant to the position"
      ];
    }
    
    return certificationList;
  };

  const updateWorkExperience = (index, tailoredExperience) => {
    try {
      setResumeData(prevData => {
        const updatedWorkExperience = [...prevData.workExperience];
        updatedWorkExperience[index] = {
          ...updatedWorkExperience[index],
          ...tailoredExperience
        };
        return { ...prevData, workExperience: updatedWorkExperience };
      });
      return true;
    } catch (error) {
      console.error("Error updating work experience:", error);
      return false;
    }
  };

  const updateProject = (index, tailoredProject) => {
    try {
      setResumeData(prevData => {
        const updatedProjects = [...prevData.projects];
        updatedProjects[index] = {
          ...updatedProjects[index],
          ...tailoredProject
        };
        return { ...prevData, projects: updatedProjects };
      });
      return true;
    } catch (error) {
      console.error("Error updating project:", error);
      return false;
    }
  };

  const updateResumeSection = (sectionName, content) => {
    try {
      setResumeData(prevData => ({
        ...prevData,
        [sectionName]: content
      }));
      return true;
    } catch (error) {
      console.error(`Error updating ${sectionName}:`, error);
      return false;
    }
  };

  const updateSkills = (skillsType, content) => {
    try {
      setResumeData(prevData => ({
        ...prevData,
        [skillsType]: content
      }));
      return true;
    } catch (error) {
      console.error(`Error updating ${skillsType}:`, error);
      return false;
    }
  };

  const tailorResumeBySection = async () => {
    setIsLoading(true);
    setError(null);
    setProgressStage(1);
    setRetryCount(0);
    setJsonDiagnostics(null);
    setSectionProgress({});

    const { jobDescription } = resumeData;
    if (!jobDescription) {
      setError("Please paste the job description first.");
      setIsLoading(false);
      setProgressStage(0);
      return;
    }

    try {
      try {
        const testPrompt = "API connection test";
        await callLlmForSection(testPrompt);
      } catch (error) {
        if (error.message && error.message.includes('API key')) {
          setError(`API Key Error: You need to provide a valid ${resumeData.llmConfig?.provider || 'LLM'} API key in your .env.local file. 
          
          1. Make sure you have a .env.local file in the project root
          2. Add your API key: ${resumeData.llmConfig?.provider === 'anthropic' ? 'ANTHROPIC_API_KEY=your_key_here' : 'OPENAI_API_KEY=your_key_here'}
          3. Restart the application`);
        } else {
          setError(`API Test Failed: ${error.message}
          
          Please check your API configuration and try again.`);
        }
        setIsLoading(false);
        setProgressStage(0);
        return;
      }

      const baseResumeData = prepareResumeForLlm(resumeData);
      let successCount = 0;
      let totalSections = 0;

      setCurrentSection("summary");
      setProgressMessage("Tailoring professional summary...");
      totalSections++;

      try {
        const summaryPrompt = createSectionPrompt("summary", baseResumeData.summary, jobDescription);
        const summaryResponse = await callLlmApiWithRetry(summaryPrompt);
        const tailoredSummary = extractFromJson(summaryResponse, ["summary"]);

        if (tailoredSummary && updateResumeSection("summary", tailoredSummary)) {
          successCount++;
          setSectionProgress(prev => ({ ...prev, summary: 'success' }));
        } else {
          setSectionProgress(prev => ({ ...prev, summary: 'failed' }));
        }
      } catch (error) {
        console.error("Error tailoring summary:", error);
        setSectionProgress(prev => ({ ...prev, summary: 'failed' }));
      }

      setCurrentSection("workExperience");
      setProgressStage(2);

      for (let i = 0; i < baseResumeData.workExperience.length; i++) {
        totalSections++;
        const experience = baseResumeData.workExperience[i];

        setProgressMessage(`Tailoring work experience ${i + 1}/${baseResumeData.workExperience.length}...`);

        try {
          const experiencePrompt = createSectionPrompt("workExperience", experience, jobDescription);
          const experienceResponse = await callLlmApiWithRetry(experiencePrompt);
          // Requesting an object with description and keyAchievements
          const tailoredExperienceData = extractFromJson(experienceResponse, ["description", "keyAchievements"]);

          if (tailoredExperienceData && typeof tailoredExperienceData === 'object' && !Array.isArray(tailoredExperienceData) && Object.keys(tailoredExperienceData).length > 0) {
            if (updateWorkExperience(i, tailoredExperienceData)) {
              successCount++;
              setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'success' }));
            } else {
              console.error(`Failed to update work experience ${i + 1} even with valid data.`);
              setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'failed' }));
            }
          } else {
            console.warn(`Tailoring work experience ${i + 1} did not return a valid object. Received:`, tailoredExperienceData);
            setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'failed' }));
          }
        } catch (error) {
          console.error(`Error tailoring work experience ${i + 1}:`, error);
          setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'failed' }));
        }
      }

      setCurrentSection("projects");
      setProgressStage(3);

      for (let i = 0; i < baseResumeData.projects.length; i++) {
        totalSections++;
        const project = baseResumeData.projects[i];

        setProgressMessage(`Tailoring project ${i + 1}/${baseResumeData.projects.length}...`);

        try {
          const projectPrompt = createSectionPrompt("projects", project, jobDescription);
          const projectResponse = await callLlmApiWithRetry(projectPrompt);
          // Requesting an object with name, description, and keyAchievements
          const tailoredProjectData = extractFromJson(projectResponse, ["name", "description", "keyAchievements"]);

          if (tailoredProjectData && typeof tailoredProjectData === 'object' && !Array.isArray(tailoredProjectData) && Object.keys(tailoredProjectData).length > 0) {
            if (updateProject(i, tailoredProjectData)) {
              successCount++;
              setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'success' }));
            } else {
              console.error(`Failed to update project ${i + 1} even with valid data.`);
              setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'failed' }));
            }
          } else {
            console.warn(`Tailoring project ${i + 1} did not return a valid object. Received:`, tailoredProjectData);
            setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'failed' }));
          }
        } catch (error) {
          console.error(`Error tailoring project ${i + 1}:`, error);
          setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'failed' }));
        }
      }

      setProgressStage(4);

      totalSections++;
      setCurrentSection("skills");
      setProgressMessage("Optimizing skills...");

      try {
        const allSkills = baseResumeData.skills.flatMap(skill =>
          Array.isArray(skill) ? skill : (skill.skills || [])
        );

        const skillsPrompt = createSectionPrompt("skills", allSkills, jobDescription);
        const skillsResponse = await callLlmApiWithRetry(skillsPrompt);
        const tailoredSkills = extractListItems(skillsResponse, "Tailored skills");

        if (tailoredSkills && tailoredSkills.length > 0) {
          const skillSectionCount = baseResumeData.skills.length;
          const skillsPerSection = Math.ceil(tailoredSkills.length / skillSectionCount);
          
          const newSkillsStructure = baseResumeData.skills.map((skillSection, index) => {
            const start = index * skillsPerSection;
            const sectionSkills = tailoredSkills.slice(start, start + skillsPerSection).filter(Boolean);
            
            if (Array.isArray(skillSection)) {
              return sectionSkills.slice(0, skillSection.length);
            } else {
              return {
                ...skillSection,
                skills: sectionSkills.slice(0, skillSection.skills ? skillSection.skills.length : 0)
              };
            }
          });

          if (updateResumeSection("skills", newSkillsStructure)) {
            successCount++;
            setSectionProgress(prev => ({ ...prev, skills: 'success' }));
          } else {
            setSectionProgress(prev => ({ ...prev, skills: 'failed' }));
          }
        } else {
          setSectionProgress(prev => ({ ...prev, skills: 'failed' }));
        }
      } catch (error) {
        console.error("Error tailoring skills:", error);
        setSectionProgress(prev => ({ ...prev, skills: 'failed' }));
      }

      totalSections++;
      setCurrentSection("languages");
      setProgressMessage("Optimizing languages...");

      try {
        const languagesPrompt = createSectionPrompt("languages", baseResumeData.languages, jobDescription);
        const languagesResponse = await callLlmApiWithRetry(languagesPrompt);
        const tailoredLanguages = extractListItems(languagesResponse, "Tailored languages");

        if (tailoredLanguages && updateSkills("languages", tailoredLanguages)) {
          successCount++;
          setSectionProgress(prev => ({ ...prev, languages: 'success' }));
        } else {
          setSectionProgress(prev => ({ ...prev, languages: 'failed' }));
        }
      } catch (error) {
        console.error("Error tailoring languages:", error);
        setSectionProgress(prev => ({ ...prev, languages: 'failed' }));
      }

      totalSections++;
      setCurrentSection("certifications");
      setProgressMessage("Optimizing certifications...");

      try {
        const certificationsPrompt = createSectionPrompt("certifications", baseResumeData.certifications, jobDescription);
        const certificationsResponse = await callLlmApiWithRetry(certificationsPrompt);
        
        const processedCertifications = processCertifications(certificationsResponse);
        
        if (processedCertifications && processedCertifications.length > 0 && 
            updateSkills("certifications", processedCertifications)) {
          successCount++;
          setSectionProgress(prev => ({ ...prev, certifications: 'success' }));
        } else {
          setSectionProgress(prev => ({ ...prev, certifications: 'failed' }));
        }
      } catch (error) {
        console.error("Error tailoring certifications:", error);
        setSectionProgress(prev => ({ ...prev, certifications: 'failed' }));
      }

      setProgressMessage(`Tailoring complete! ${successCount}/${totalSections} sections updated successfully.`);

      if (successCount < totalSections / 2) {
        setError(`Warning: Only ${successCount} out of ${totalSections} sections were successfully tailored. Some sections may not reflect the job description optimally.`);
      }

    } catch (error) {
      console.error("Section-by-section tailoring error:", error);
      
      if (error.type === 'API_KEY_ERROR') {
        setError(`API Key Error: You need to set up your ${resumeData.llmConfig?.provider || 'LLM'} API key. 
        
        1. Create a .env file in the project root
        2. Add your API key: ${resumeData.llmConfig?.provider === 'anthropic' ? 'ANTHROPIC_API_KEY=your_key_here' : 'OPENAI_API_KEY=your_key_here'}
        3. Restart the application
        
        You can get an API key from ${resumeData.llmConfig?.provider === 'anthropic' ? 'https://console.anthropic.com/' : 'https://platform.openai.com/account/api-keys'}`);
      } else if (error.message && error.message.includes('overloaded')) {
        setError(`AI service is currently overloaded. Please try again in a few minutes.`);
      } else if (error.message && error.message.includes('rate_limit')) {
        setError(`Rate limit exceeded. Please try again in a few minutes.`);
      } else {
        setError(`Error during tailoring: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
      setCurrentSection(null);
      setProgressStage(0);
    }
  };

  const refineResume = async () => {
    const { instructionPrompt } = resumeData;
    if (!instructionPrompt) {
      setError("Please enter refinement instructions first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgressStage(1);
    setRetryCount(0);
    setJsonDiagnostics(null);
    setProgressMessage("Processing refinement request...");

    const baseResumeData = prepareResumeForLlm(resumeData);

    try {
      const prompt = `Please refine the following resume based on this instruction: "${instructionPrompt}"
      
      Resume data:
      ${JSON.stringify(baseResumeData, null, 2)}
      
      Please provide ONLY the modified sections that need to change based on the instruction.
      Format your response as plain text with clear section markers.`;

      const response = await callLlmApiWithRetry(prompt);
      
      setProgressMessage("Extracting refinements...");
      
      setProgressMessage("Refinement complete!");
    } catch (error) {
      console.error("Error during refinement:", error);
      
      if (error.message && error.message.includes('overloaded')) {
        setError(`AI service is currently overloaded. Please try again in a few minutes.`);
      } else if (error.message && error.message.includes('rate_limit')) {
        setError(`Rate limit exceeded. Please try again in a few minutes.`);
      } else {
        setError(`Refinement error: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
      setProgressStage(0);
    }
  };

  const tailorResume = () => {
    tailorResumeBySection();
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

      {isLoading && progressStage > 0 && (
        <div className="mt-2 p-3 bg-fuchsia-800/30 border border-fuchsia-700 rounded">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">Tailoring Progress</h3>
            <span className="text-xs text-fuchsia-300">
              {retryCount > 0 ? `Retry ${retryCount}` : `Phase ${progressStage}/4`}
            </span>
          </div>
          <p className="text-sm text-white">{progressMessage}</p>
          <div className="w-full bg-fuchsia-700/30 rounded-full h-2.5 mt-2">
            <div 
              className="bg-fuchsia-400 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${(progressStage / 4) * 100}%` }}
            ></div>
          </div>
          
          {Object.keys(sectionProgress).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(sectionProgress).map(([section, status]) => (
                <div 
                  key={section} 
                  className={`text-xs px-2 py-1 rounded flex items-center justify-between ${
                    status === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
                  }`}
                >
                  <span>{section.replace(/[-0-9]/g, ' ').trim()}</span>
                  <span>{status === 'success' ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          
          <div className="bg-yellow-800/30 p-2 rounded mb-3 text-xs text-yellow-200">
            <p>⚠️ <strong>API Key Required</strong>: You need to set up your API key in the .env.local file.</p>
            <ol className="list-decimal ml-4 mt-1">
              <li>Create a .env.local file in the project root</li>
              <li>Add your API key: <code>{resumeData.llmConfig?.provider === "openai" ? "OPENAI_API_KEY=sk-..." : "ANTHROPIC_API_KEY=sk-ant-..."}</code></li>
              <li>Restart the application</li>
            </ol>
            <p className="mt-1">If you encounter API errors, check your API key and make sure it's correctly formatted. Most errors will be reported immediately instead of retrying.</p>
          </div>
          
          <label className="text-xs text-white block">Provider:</label>
          <select
            name="provider"
            value={(resumeData.llmConfig?.provider) || "anthropic"}
            onChange={handleLlmConfigChange}
            className="w-full other-input text-sm"
          >
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI GPT</option>
          </select>

          <label className="text-xs text-white block">Model:</label>
          <input
            type="text"
            name="model"
            placeholder={
              (resumeData.llmConfig?.provider === "openai") 
                ? "gpt-3.5-turbo" 
                : "claude-3-haiku-20240307"
            }
            value={resumeData.llmConfig?.model || ""}
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
                value={resumeData.llmConfig?.max_tokens || ""}
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
                value={resumeData.llmConfig?.temperature || ""}
                onChange={handleLlmConfigChange}
                className="w-full other-input text-sm"
              />
            </div>
          </div>

          <label className="text-xs text-white block">API URL (Backend Proxy):</label>
          <input
            type="text"
            name="apiUrl"
            value={resumeData.llmConfig?.apiUrl || ""}
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
        {isLoading ? `Tailoring... (${progressStage > 0 ? `Phase ${progressStage}/4` : 'Processing'})` : "Tailor Resume to Job Description"}
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

      {error && (
        <div className="mt-4 p-4 border border-red-300 bg-red-50 rounded-md">
          <h3 className="font-bold text-red-700">Error</h3>
          <p className="whitespace-pre-line">{error}</p>
          
          {jsonDiagnostics && (
            <div className="mt-2">
              <details className="mt-2">
                <summary className="text-sm font-medium text-red-800 cursor-pointer">
                  Show diagnostic information
                </summary>
                <div className="mt-2 p-2 bg-white rounded border border-red-200 text-xs overflow-auto">
                  <h4 className="font-bold">Raw Response (first 1000 chars):</h4>
                  <pre className="mt-1 p-2 bg-gray-100 rounded overflow-auto max-h-40">
                    {jsonDiagnostics.rawResponse}
                  </pre>
                  
                  <h4 className="font-bold mt-3">Parse Attempts:</h4>
                  <ul className="list-disc pl-5">
                    {jsonDiagnostics.attempts.map((attempt, i) => (
                      <li key={i} className={attempt.success ? "text-green-600" : "text-red-600"}>
                        <strong>{attempt.method}:</strong> {attempt.success ? 'Success' : attempt.error}
                        {attempt.attemptedJson && !attempt.success && (
                          <details>
                            <summary className="cursor-pointer">Attempted JSON</summary>
                            <pre className="mt-1 p-1 bg-gray-100 rounded overflow-auto max-h-24 text-xs">
                              {attempt.attemptedJson}
                            </pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JobDescriptionTailor;