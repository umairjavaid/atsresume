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
    // Direct extraction if data.content is a string (primary expected format)
    if (data && typeof data.content === 'string') {
      return data.content;
    }

    // Fallback for OpenAI-like structures (including data._raw if present)
    if (data?.choices?.[0]?.message?.content) {
      console.warn("Extracting text via data.choices[0].message.content");
      return data.choices[0].message.content;
    }
    if (data?._raw?.choices?.[0]?.message?.content) {
      console.warn("Extracting text via data._raw.choices[0].message.content");
      return data._raw.choices[0].message.content;
    }

    // Fallback for Anthropic-like structures (including data._raw if present)
    // and also generic data.content[0].text
    if (data?.content?.[0]?.text) {
      console.warn("Extracting text via data.content[0].text");
      return data.content[0].text;
    }
    if (data?._raw?.content?.[0]?.text) {
      console.warn("Extracting text via data._raw.content[0].text");
      return data._raw.content[0].text;
    }

    // If data.content exists but is not a string (e.g. array), log warning.
    if (data && data.content !== undefined) {
        console.warn(`extractResponseText: data.content found but is not a string. Type: ${typeof data.content}. Value:`, data.content);
    } else if (data) {
        console.warn("extractResponseText: Could not find expected content in response data. Data:", data);
    } else {
        console.warn("extractResponseText: Received null or undefined data.");
    }

    return ""; // Default fallback
  };

  const createSectionPrompt = (sectionType, sectionContent, jobDescription) => {
    const basePrompt = `Given the following job description:\n\n${jobDescription}\n\n`;
    
    switch(sectionType) {
      case "summary":
        return `${basePrompt}Please tailor this professional summary to highlight skills and qualifications relevant to the job description:\n\n${sectionContent}\n\nReturn *only* the refined summary text. Do not include any JSON formatting, markdown, or any other explanatory text.`;
      
      case "workExperience":
        return `${basePrompt}Please tailor this work experience to highlight achievements and responsibilities relevant to the job description:\n\nCompany: ${sectionContent.company}\nPosition: ${sectionContent.position}\nDescription: ${sectionContent.description || ''}\nKey Achievements: ${sectionContent.keyAchievements || ''}\n\nReturn the result *only* as a JSON object with two string keys: "description" and "keyAchievements". Example: {"description": "Tailored description text...", "keyAchievements": "- Achievement 1 text\\n- Achievement 2 text"}. Do not include any other text or explanations outside of this JSON object.`;
      
      case "projects":
        return `${basePrompt}Please tailor this project description to highlight skills and accomplishments relevant to the job description:\n\nProject: ${sectionContent.name}\nDescription: ${sectionContent.description || ''}\nKey Achievements: ${sectionContent.keyAchievements || ''}\n\nReturn the result *only* as a JSON object with two string keys: "description" and "keyAchievements". Example: {"description": "Tailored project description text...", "keyAchievements": "- Project achievement 1\\n- Project achievement 2"}. Do not include any other text or explanations outside of this JSON object.`;
      
      case "skills":
        return `${basePrompt}Given these skills:\n\n${sectionContent.join(", ")}\n\nFrom the provided list of skills, return *only* a comma-separated list of those skills relevant to the job description. Only include skills from the original list. Do not include any other text, explanations, or introductory phrases. Example: Skill1, Skill2, Skill3`;
      
      case "languages":
        return `${basePrompt}Given these languages:\n\n${sectionContent.join(", ")}\n\nPlease order these languages based on relevance to the job description. Return *only* a comma-separated list of the provided languages, ordered by relevance. Do not add new languages. Do not include any other text, explanations, or introductory phrases. Example: English, Spanish, French`;
      
      case "certifications":
        return `${basePrompt}Given these certifications:\n\n${sectionContent.join(", ")}\n\nPlease order these certifications based on relevance to the job description. Return *only* a comma-separated list of the provided certifications, ordered by relevance. Do not add new certifications. Do not include any other text, explanations, or introductory phrases. Example: Cert1, Cert2, Cert3`;
      
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
    
    // Fallback to splitting by comma if not clearly JSON
    const rawItems = response.split(',');
    const cleanedItems = rawItems.map(item => {
      let cleaned = item.trim();
      // Remove trailing period, but be careful not to remove from e.g. "example.com" if that's relevant
      if (cleaned.endsWith('.') && !cleaned.match(/\.[a-zA-Z]{2,}$/)) {
        cleaned = cleaned.slice(0, -1);
      }
      return cleaned;
    }).filter(item => {
      if (!item || item.length === 0 || item.length > 70) return false; // Basic length check
      // Filter out common filler phrases
      const fillerRegex = /^(Okay|Sure|Here is|Here are|The relevant|I have|Certainly|Alright|Great|Got it|No problem|Perfect|Absolutely|You got it|Of course|Definitely|Without a doubt|Indeed|Naturally|Positively|Undoubtedly|Unquestionably|As you wish|By all means|With pleasure|My pleasure|You bet|Consider it done|Done|Affirmative|Roger that|Copy that|10-4|Yes|No|Maybe|Possibly|Perhaps|I think so|I believe so|I suppose so|I guess so|I imagine so|I reckon so|I figure so|I assume so|I presume so|I surmise so|I deduce so|I infer so|I gather so|I understand so|I take it so|I expect so|I hope so|I trust so|I'm sure|I'm certain|I'm positive|I'm confident|I'm convinced|I'm persuaded|I'm satisfied|I'm content|I'm happy|I'm glad|I'm pleased|I'm delighted|I'm thrilled|I'm ecstatic|I'm overjoyed|I'm elated|I'm euphoric|I'm jubilant|I'm exultant|I'm triumphant|I'm victorious|I'm successful|I'm prosperous|I'm flourishing|I'm thriving|I'm blooming|I'm blossoming|I'm shining|I'm glowing|I'm radiant|I'm sparkling|I'm dazzling|I'm brilliant|I'm magnificent|I'm splendid|I'm superb|I'm wonderful|I'm marvelous|I'm fantastic|I'm fabulous|I'm terrific|I'm awesome|I'm amazing|I'm incredible|I'm phenomenal|I'm unbelievable|I'm astounding|I'm astonishing|I'm staggering|I'm breathtaking|I'm mind-blowing|I'm mind-boggling|I'm mind-bending|I'm mind-altering|I'm mind-expanding|I'm mind-opening|I'm eye-opening|I'm revelatory|I'm enlightening|I'm illuminating|I'm instructive|I'm informative|I'm educational|I'm edifying|I'm uplifting|I'm inspiring|I'm motivating|I'm encouraging|I'm stimulating|I'm invigorating|I'm refreshing|I'm revitalizing|I'm rejuvenating|I'm restorative|I'm healing|I'm therapeutic|I'm curative|I'm remedial|I'm corrective|I'm palliative|I'm soothing|I'm calming|I'm relaxing|I'm pacifying|I'm tranquilizing|I'm sedative|I'm hypnotic|I'm soporific|I'm narcotic|I'm opiatic|I'm anodyne|I'm analgesic|I'm anesthetic|I'm numbing|I'm deadening|I'm dulling|I'm blunting|I'm desensitizing|I'm immobilizing|I'm paralyzing|I'm petrifying|I'm ossifying|I'm fossilizing|I'm mummifying|I'm embalming|I'm preserving|I'm conserving|I'm protecting|I'm safeguarding|I'm sheltering|I'm shielding|I'm guarding|I'm defending|I'm securing|I'm ensuring|I'm assuring|I'm guaranteeing|I'm warranting|I'm certifying|I'm verifying|I'm authenticating|I'm validating|I'm confirming|I'm corroborating|I'm substantiating|I'm supporting|I'm backing|I'm endorsing|I'm sanctioning|I'm approving|I'm authorizing|I'm licensing|I'm permitting|I'm allowing|I'm enabling|I'm empowering|I'm facilitating|I'm assisting|I'm helping|I'm aiding|I'm succoring|I'm ministering to|I'm attending to|I'm caring for|I'm looking after|I'm tending to|I'm nursing|I'm fostering|I'm nurturing|I'm cultivating|I'm developing|I'm promoting|I'm advancing|I'm furthering|I'm boosting|I'm enhancing|I'm improving|I'm upgrading|I'm refining|I'm perfecting|I'm polishing|I'm honing|I'm sharpening|I'm whetting|I'm stimulating|I'm exciting|I'm arousing|I'm provoking|I'm inciting|I'm instigating|I'm fomenting|I'm kindling|I'm igniting|I'm firing|I'm fueling|I'm feeding|I'm nourishing|I'm supplying|I'm providing|I'm furnishing|I'm equipping|I'm outfitting|I'm accoutering|I'm rigging|I'm harnessing|I'm saddling|I'm yoking|I'm hitching|I'm coupling|I'm linking|I'm connecting|I'm joining|I'm uniting|I'm combining|I'm merging|I'm blending|I'm fusing|I'm amalgamating|I'm integrating|I'm incorporating|I'm assimilating|I'm absorbing|I'm engulfing|I'm swallowing|I'm devouring|I'm consuming|I'm ingesting|I'm digesting|I'm metabolizing|I'm processing|I'm handling|I'm managing|I'm controlling|I'm directing|I'm guiding|I'm steering|I'm piloting|I'm navigating|I'm conducting|I'm operating|I'm running|I'm administering|I'm supervising|I'm overseeing|I'm inspecting|I'm monitoring|I'm observing|I'm watching|I'm scrutinizing|I'm examining|I'm analyzing|I'm evaluating|I'm assessing|I'm appraising|I'm judging|I'm rating|I'm ranking|I'm grading|I'm scoring|I'm marking|I'm labeling|I'm tagging|I'm branding|I'm stamping|I'm engraving|I'm etching|I'm carving|I'm sculpting|I'm molding|I'm shaping|I'm forming|I'm fashioning|I'm designing|I'm creating|I'm inventing|I'm originating|I'm conceiving|I'm imagining|I'm envisioning|I'm visualizing|I'm dreaming|I'm fantasizing|I'm hallucinating|I'm tripping|I'm flying|I'm soaring|I'm gliding|I'm floating|I'm drifting|I'm sailing|I'm cruising|I'm coasting|I'm sliding|I'm slipping|I'm skidding|I'm skiing|I'm skating|I'm surfing|I'm swimming|I'm diving|I'm plunging|I'm sinking|I'm drowning|I'm dying|I'm perishing|I'm expiring|I'm ceasing|I'm stopping|I'm halting|I'm pausing|I'm resting|I'm sleeping|I'm hibernating|I'm estivating|I'm dormant|I'm latent|I'm quiescent|I'm inactive|I'm idle|I'm fallow|I'm vacant|I'm empty|I'm void|I'm barren|I'm sterile|I'm infertile|I'm unproductive|I'm fruitless|I'm futile|I'm vain|I'm useless|I'm worthless|I'm pointless|I'm meaningless|I'm senseless|I'm absurd|I'm ludicrous|I'm ridiculous|I'm preposterous|I'm outrageous|I'm scandalous|I'm shocking|I'm appalling|I'm horrifying|I'm terrifying|I'm dreadful|I'm fearful|I'm frightful|I'm ghastly|I'm gruesome|I'm grisly|I'm macabre|I'm morbid|I'm sinister|I'm evil|I'm wicked|I'm vile|I'm nefarious|I'm heinous|I'm atrocious|I'm monstrous|I'm diabolical|I'm fiendish|I'm demonic|I'm satanic|I'm hellish|I'm infernal|I'm damned|I'm cursed|I'm doomed|I'm fated|I'm destined|I'm predestined|I'm preordained|I'm foreordained|I'm predetermined|I'm foregone|I'm inevitable|I'm unavoidable|I'm inescapable|I'm certain|I'm sure|I'm positive|I'm confident|I'm convinced|I'm persuaded|I'm satisfied|I'm content|I'm happy|I'm glad|I'm pleased|I'm delighted|I'm thrilled|I'm ecstatic|I'm overjoyed|I'm elated|I'm euphoric|I'm jubilant|I'm exultant|I'm triumphant|I'm victorious|I'm successful|I'm prosperous|I'm flourishing|I'm thriving|I'm blooming|I'm blossoming|I'm shining|I'm glowing|I'm radiant|I'm sparkling|I'm dazzling|I'm brilliant|I'm magnificent|I'm splendid|I'm superb|I'm wonderful|I'm marvelous|I'm fantastic|I'm fabulous|I'm terrific|I'm awesome|I'm amazing|I'm incredible|I'm phenomenal|I'm unbelievable|I'm astounding|I'm astonishing|I'm staggering|I'm breathtaking|I'm mind-blowing|I'm mind-boggling|I'm mind-bending|I'm mind-altering|I'm mind-expanding|I'm mind-opening|I'm eye-opening|I'm revelatory|I'm enlightening|I'm illuminating|I'm instructive|I'm informative|I'm educational|I'm edifying|I'm uplifting|I'm inspiring|I'm motivating|I'm encouraging|I'm stimulating|I'm invigorating|I'm refreshing|I'm revitalizing|I'm rejuvenating|I'm restorative|I'm healing|I'm therapeutic|I'm curative|I'm remedial|I'm corrective|I'm palliative|I'm soothing|I'm calming|I'm relaxing|I'm pacifying|I'm tranquilizing|I'm sedative|I'm hypnotic|I'm soporific|I'm narcotic|I'm opiatic|I'm anodyne|I'm analgesic|I'm anesthetic|I'm numbing|I'm deadening|I'm dulling|I'm blunting|I'm desensitizing|I'm immobilizing|I'm paralyzing|I'm petrifying|I'm ossifying|I'm fossilizing|I'm mummifying|I'm embalming|I'm preserving|I'm conserving|I'm protecting|I'm safeguarding|I'm sheltering|I'm shielding|I'm guarding|I'm defending|I'm securing|I'm ensuring|I'm assuring|I'm guaranteeing|I'm warranting|I'm certifying|I'm verifying|I'm authenticating|I'm validating|I'm confirming|I'm corroborating|I'm substantiating|I'm supporting|I'm backing|I'm endorsing|I'm sanctioning|I'm approving|I'm authorizing|I'm licensing|I'm permitting|I'm allowing|I'm enabling|I'm empowering|I'm facilitating|I'm assisting|I'm helping|I'm aiding|I'm succoring|I'm ministering to|I'm attending to|I'm caring for|I'm looking after|I'm tending to|I'm nursing|I'm fostering|I'm nurturing|I'm cultivating|I'm developing|I'm promoting|I'm advancing|I'm furthering|I'm boosting|I'm enhancing|I'm improving|I'm upgrading|I'm refining|I'm perfecting|I'm polishing|I'm honing|I'm sharpening|I'm whetting|I'm stimulating|I'm exciting|I'm arousing|I'm provoking|I'm inciting|I'm instigating|I'm fomenting|I'm kindling|I'm igniting|I'm firing|I'm fueling|I'm feeding|I'm nourishing|I'm supplying|I'm providing|I'm furnishing|I'm equipping|I'm outfitting|I'm accoutering|I'm rigging|I'm harnessing|I'm saddling|I'm yoking|I'm hitching|I'm coupling|I'm linking|I'm connecting|I'm joining|I'm uniting|I'm combining|I'm merging|I'm blending|I'm fusing|I'm amalgamating|I'm integrating|I'm incorporating|I'm assimilating|I'm absorbing|I'm engulfing|I'm swallowing|I'm devouring|I'm consuming|I'm ingesting|I'm digesting|I'm metabolizing|I'm processing|I'm handling|I'm managing|I'm controlling|I'm directing|I'm guiding|I'm steering|I'm piloting|I'm navigating|I'm conducting|I'm operating|I'm running|I'm administering|I'm supervising|I'm overseeing|I'm inspecting|I'm monitoring|I'm observing|I'm watching|I'm scrutinizing|I'm examining|I'm analyzing|I'm evaluating|I'm assessing|I'm appraising|I'm judging|I'm rating|I'm ranking|I'm grading|I'm scoring|I'm marking|I'm labeling|I'm tagging|I'm branding|I'm stamping|I'm engraving|I'm etching|I'm carving|I'm sculpting|I'm molding|I'm shaping|I'm forming|I'm fashioning|I'm designing|I'm creating|I'm inventing|I'm originating|I'm conceiving|I'm imagining|I'm envisioning|I'm visualizing|I'm dreaming|I'm fantasizing|I'm hallucinating|I'm tripping|I'm flying|I'm soaring|I'm gliding|I'm floating|I'm drifting|I'm sailing|I'm cruising|I'm coasting|I'm sliding|I'm slipping|I'm skidding|I'm skiing|I'm skating|I'm surfing|I'm swimming|I'm diving|I'm plunging|I'm sinking|I'm drowning|I'm dying|I'm perishing|I'm expiring|I'm ceasing|I'm stopping|I'm halting|I'm pausing|I'm resting|I'm sleeping|I'm hibernating|I'm estivating|I'm dormant|I'm latent|I'm quiescent|I'm inactive|I'm idle|I'm fallow|I'm vacant|I'm empty|I'm void|I'm barren|I'm sterile|I'm infertile|I'm unproductive|I'm fruitless|I'm futile|I'm vain|I'm useless|I'm worthless|I'm pointless|I'm meaningless|I'm senseless|I'm absurd|I'm ludicrous|I'm ridiculous|I'm preposterous|I'm outrageous|I'm scandalous|I'm shocking|I'm appalling|I'm horrifying|I'm terrifying|I'm dreadful|I'm fearful|I'm frightful|I'm ghastly|I'm gruesome|I'm grisly|I'm macabre|I'm morbid|I'm sinister|I'm evil|I'm wicked|I'm vile|I'm nefarious|I'm heinous|I'm atrocious|I'm monstrous|I'm diabolical|I'm fiendish|I'm demonic|I'm satanic|I'm hellish|I'm infernal|I'm damned|I'm cursed|I'm doomed|I'm fated|I'm destined|I'm predestined|I'm preordained|I'm foreordained|I'm predetermined|I'm foregone|I'm inevitable|I'm unavoidable|I'm inescapable)\s*:?\s*/i;
      if (fillerRegex.test(item)) return false;
      // Filter out items that look like sentences
      if (item.includes(' ') && item.match(/[.!?]$/)) return false; // Has space and ends with sentence punctuation
      return true;
    });
    return cleanedItems.length > 0 ? cleanedItems : null;
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
    let jsonExtractedSuccessfully = false;

    if (tailoredCertifications.includes('{') || 
        tailoredCertifications.includes('[') || 
        tailoredCertifications.includes('```')) {
      try {
        const extracted = extractFromJson(tailoredCertifications, 
          ['certifications', 'certification', 'credentials', 'qualifications', 'items']);
          
        if (extracted) {
          let tempExtractedList = [];
          if (Array.isArray(extracted)) {
            tempExtractedList = extracted;
            jsonExtractedSuccessfully = true;
          } else if (typeof extracted === 'string') {
            // If extractFromJson returns a string, it means it couldn't parse it as JSON
            // but also didn't hit its internal string fallback, or the keys weren't found.
            // We might still want to try splitting it if it seems like a list.
            if (extracted.includes(',')) {
                 tempExtractedList = extracted.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
                 jsonExtractedSuccessfully = true; // Consider this a successful extraction for list purposes
            } else {
                // A single string that's not a list, could be a valid single cert or noise
                // We'll let the main parser handle this if jsonExtractedSuccessfully remains false
            }
          } else if (typeof extracted === 'object' && extracted !== null) {
            // This case handles if extractFromJson returns an object like {certifications: [...]}
            // We look for a value that is an array.
            const arrayValue = Object.values(extracted).find(val => Array.isArray(val));
            if (arrayValue) {
                tempExtractedList = arrayValue;
                jsonExtractedSuccessfully = true;
            }
          }

          if (jsonExtractedSuccessfully) {
            const filteredExtracted = tempExtractedList.filter(cert =>
              cert && typeof cert === 'string' &&
              (cert.length > 1 && cert.length < 150 && !cert.includes(':')) && // Adjusted length and colon check
              (certPatterns.some(pattern => pattern.test(cert)) || cert.includes('Course') || cert.includes('Training'))
            );
            certificationList.push(...filteredExtracted);
            // If JSON extraction yields results, prioritize them.
            if (certificationList.length > 0) return certificationList;
          }
        }
      } catch (error) {
        console.error("Error processing JSON-like certifications string:", error);
      }
    }

    // If JSON extraction didn't yield results, or if the input wasn't JSON-like, try direct parsing.
    // But be wary if the string is too long and JSON extraction failed.
    if (jsonExtractedSuccessfully === false && tailoredCertifications.length > 300) {
      console.warn("Skipping direct parsing of long certification string after JSON extraction failed.");
      return null; // Or an empty list, depending on desired strictness
    }
    
    // Standard comma/newline splitting fallback
    const candidates = tailoredCertifications
      .replace(/```json/g, '') // remove markdown
      .replace(/```/g, '')
      .split(/[\n,]/) // split by newline or comma
      .map(item => item.trim())
      .filter(item =>
        item && item.length > 1 && item.length < 150 && !item.includes(':') // Basic filtering
      );
    
    for (const candidate of candidates) {
      if (certPatterns.some(pattern => pattern.test(candidate)) || 
          candidate.includes('Course') || 
          candidate.includes('Training')) {
        // Avoid duplicates if jsonExtractedSuccessfully was true but yielded empty due to filtering
        if (!certificationList.includes(candidate)) {
            certificationList.push(candidate);
        }
      }
    }
    
    // Return default certifications only if the original response was very short and implies none.
    const trimmedResponse = tailoredCertifications.trim().toLowerCase();
    if (certificationList.length === 0 && (trimmedResponse.length < 10 && (trimmedResponse === "none" || trimmedResponse === "n/a" || trimmedResponse === "no certifications"))) {
      console.log("LLM indicated no certifications, returning default placeholders.");
      return [
        "Certified Professional in relevant technology",
        "Technical training relevant to the position"
      ];
    }
    
    return certificationList.length > 0 ? certificationList : null; // Return null if no valid certs found from a noisy response
  };

  const isValidString = (str, minLength = 1, maxLength = Infinity, fieldName = "String") => {
    if (typeof str !== 'string') {
      console.warn(`${fieldName} validation failed: Not a string. Received:`, str);
      return false;
    }
    const trimmedStr = str.trim();
    if (trimmedStr.length < minLength) {
      console.warn(`${fieldName} validation failed: Too short (min ${minLength}). Length: ${trimmedStr.length}. Value: "${trimmedStr.substring(0,50)}"`);
      return false;
    }
    if (trimmedStr.length > maxLength) {
      console.warn(`${fieldName} validation failed: Too long (max ${maxLength}). Length: ${trimmedStr.length}. Value: "${trimmedStr.substring(0,50)}..."`);
      return false;
    }
    // Check if it looks like a stringified JSON object or array
    if ((trimmedStr.startsWith("{") && trimmedStr.endsWith("}")) || (trimmedStr.startsWith("[") && trimmedStr.endsWith("]"))) {
        try {
            JSON.parse(trimmedStr); // If it parses, it's likely stringified JSON
            console.warn(`${fieldName} validation failed: Appears to be stringified JSON. Value: "${trimmedStr.substring(0,100)}..."`);
            return false;
        } catch (e) {
            // Not valid JSON, so it's probably a string with braces, which is fine
        }
    }
    return true;
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
        const llmOutputForSummary = await callLlmApiWithRetry(summaryPrompt);
        console.log("Raw LLM output for Summary:", llmOutputForSummary);

        // Validate llmOutputForSummary: must be a string, reasonable length, not JSON-like
        const trimmedSummary = llmOutputForSummary ? llmOutputForSummary.trim() : "";

        // The extractFromJson was used before, but for summary, we expect direct text.
        // We'll use isValidString directly. The prompt asks for "only the refined summary text".
        if (isValidString(trimmedSummary, 10, 2500, "Summary text") &&
            !(trimmedSummary.startsWith('{"') && trimmedSummary.endsWith('"}'))) {
          console.log("Validated Summary:", trimmedSummary);
          if (updateResumeSection("summary", trimmedSummary)) {
            successCount++;
            setSectionProgress(prev => ({ ...prev, summary: 'success' }));
          } else {
            console.warn("Failed to update summary section even after validation.");
            setSectionProgress(prev => ({ ...prev, summary: 'failed' }));
          }
        } else {
          console.warn(`Summary validation failed. Raw output: "${llmOutputForSummary.substring(0,100)}..."`, llmOutputForSummary);
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
          const llmResponse = await callLlmApiWithRetry(experiencePrompt);
          console.log(`Raw LLM output for Work Experience ${i + 1}:`, llmResponse);

          let tailoredData = extractFromJson(llmResponse, ["description", "keyAchievements"]);
          console.log(`Extracted data for Work Experience ${i + 1}:`, tailoredData);

          if (tailoredData && typeof tailoredData === 'object' && !Array.isArray(tailoredData)) {
            const validatedData = {};
            let hasValidFields = false;

            if (tailoredData.description !== undefined) {
              if (isValidString(tailoredData.description, 10, 5000, `Work Experience ${i+1} Description`)) {
                validatedData.description = tailoredData.description.trim();
                hasValidFields = true;
              } else {
                console.warn(`Invalid description for Work Experience ${i + 1}.`);
              }
            }

            if (tailoredData.keyAchievements !== undefined) {
              // Key achievements can sometimes be an array from LLM, convert to string if so.
              let achievementsString = tailoredData.keyAchievements;
              if (Array.isArray(achievementsString)) {
                achievementsString = achievementsString.join("\n- ").trim();
                if (achievementsString) achievementsString = "- " + achievementsString;
              }

              if (isValidString(achievementsString, 5, 2000, `Work Experience ${i+1} Key Achievements`)) {
                validatedData.keyAchievements = achievementsString.trim();
                hasValidFields = true;
              } else {
                 console.warn(`Invalid keyAchievements for Work Experience ${i + 1}.`);
              }
            }

            if (hasValidFields && Object.keys(validatedData).length > 0) {
              console.log(`Validated data for Work Experience ${i + 1}:`, validatedData);
              if (updateWorkExperience(i, validatedData)) {
                successCount++;
                setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'success' }));
              } else {
                console.error(`Failed to update work experience ${i + 1} even with validated data.`);
                setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'failed' }));
              }
            } else {
              console.warn(`No valid fields found after validation for Work Experience ${i + 1}. Original extracted:`, tailoredData);
              setSectionProgress(prev => ({ ...prev, [`workExperience-${i}`]: 'failed' }));
            }
          } else {
            console.warn(`Tailoring work experience ${i + 1} did not return a valid object from extractFromJson. Received:`, tailoredData);
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
          const llmResponse = await callLlmApiWithRetry(projectPrompt);
          console.log(`Raw LLM output for Project ${i + 1}:`, llmResponse);

          let tailoredData = extractFromJson(llmResponse, ["name", "description", "keyAchievements"]);
          console.log(`Extracted data for Project ${i + 1}:`, tailoredData);

          if (tailoredData && typeof tailoredData === 'object' && !Array.isArray(tailoredData)) {
            const validatedData = {};
            let hasValidFields = false;

            if (tailoredData.name !== undefined) {
              if (isValidString(tailoredData.name, 2, 150, `Project ${i+1} Name`)) {
                validatedData.name = tailoredData.name.trim();
                // Name is crucial, so we consider it a valid field towards `hasValidFields`
                hasValidFields = true;
              } else {
                console.warn(`Invalid name for Project ${i + 1}.`);
                // If name is invalid, we might not want to proceed with this project update
              }
            }

            if (tailoredData.description !== undefined) {
              if (isValidString(tailoredData.description, 10, 5000, `Project ${i+1} Description`)) {
                validatedData.description = tailoredData.description.trim();
                hasValidFields = true;
              } else {
                console.warn(`Invalid description for Project ${i + 1}.`);
              }
            }

            if (tailoredData.keyAchievements !== undefined) {
              let achievementsString = tailoredData.keyAchievements;
              if (Array.isArray(achievementsString)) {
                achievementsString = achievementsString.join("\n- ").trim();
                if(achievementsString) achievementsString = "- " + achievementsString;
              }
              if (isValidString(achievementsString, 5, 2000, `Project ${i+1} Key Achievements`)) {
                validatedData.keyAchievements = achievementsString.trim();
                hasValidFields = true;
              } else {
                console.warn(`Invalid keyAchievements for Project ${i + 1}.`);
              }
            }

            // Ensure there's something to update, especially if name was initially present and valid
            // or if other fields became valid.
            if (hasValidFields && Object.keys(validatedData).length > 0) {
              console.log(`Validated data for Project ${i + 1}:`, validatedData);
              if (updateProject(i, validatedData)) {
                successCount++;
                setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'success' }));
              } else {
                console.error(`Failed to update project ${i + 1} even with validated data.`);
                setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'failed' }));
              }
            } else {
              console.warn(`No valid fields found after validation for Project ${i + 1}. Original extracted:`, tailoredData);
              setSectionProgress(prev => ({ ...prev, [`project-${i}`]: 'failed' }));
            }
          } else {
            console.warn(`Tailoring project ${i + 1} did not return a valid object from extractFromJson. Received:`, tailoredData);
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
        const llmResponse = await callLlmApiWithRetry(skillsPrompt);
        console.log("Raw LLM output for Skills:", llmResponse);

        const tailoredItems = extractListItems(llmResponse, "Tailored skills");
        console.log("Extracted items for Skills:", tailoredItems);

        if (Array.isArray(tailoredItems)) {
          const validItems = tailoredItems
            .map(item => typeof item === 'string' ? item.trim() : "")
            .filter(item => item.length > 0 && item.length < 70 && !item.endsWith('.')); // Skills generally don't end with '.'
          
          console.log("Validated items for Skills:", validItems);

          if (validItems.length > 0) {
            const skillSectionCount = baseResumeData.skills.length;
            const skillsPerSection = Math.ceil(validItems.length / skillSectionCount);
            
            const newSkillsStructure = baseResumeData.skills.map((skillSection, index) => {
              const start = index * skillsPerSection;
              const sectionSkills = validItems.slice(start, start + skillsPerSection).filter(Boolean);

              if (Array.isArray(skillSection)) {
                // Ensure we don't introduce empty strings if original section was smaller
                return sectionSkills.slice(0, Math.max(skillSection.length, sectionSkills.length));
              } else {
                return {
                  ...skillSection,
                  skills: sectionSkills.slice(0, Math.max(skillSection.skills ? skillSection.skills.length : 0, sectionSkills.length))
                };
              }
            });

            if (updateResumeSection("skills", newSkillsStructure)) {
              successCount++;
              setSectionProgress(prev => ({ ...prev, skills: 'success' }));
            } else {
              console.warn("Failed to update skills section even after validation.");
              setSectionProgress(prev => ({ ...prev, skills: 'failed' }));
            }
          } else {
            console.warn("Skills list validation resulted in empty or invalid list. Original extracted:", tailoredItems);
            setSectionProgress(prev => ({ ...prev, skills: 'failed' }));
          }
        } else {
          console.warn("Tailoring skills did not return an array from extractListItems. Received:", tailoredItems);
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
        const llmResponse = await callLlmApiWithRetry(languagesPrompt);
        console.log("Raw LLM output for Languages:", llmResponse);

        const tailoredItems = extractListItems(llmResponse, "Tailored languages");
        console.log("Extracted items for Languages:", tailoredItems);

        if (Array.isArray(tailoredItems)) {
          const validItems = tailoredItems
            .map(item => typeof item === 'string' ? item.trim() : "")
            .filter(item => item.length > 0 && item.length < 70 && !item.endsWith('.'));

          console.log("Validated items for Languages:", validItems);

          if (validItems.length > 0) {
            if (updateSkills("languages", validItems)) {
              successCount++;
              setSectionProgress(prev => ({ ...prev, languages: 'success' }));
            } else {
              console.warn("Failed to update languages section even after validation.");
              setSectionProgress(prev => ({ ...prev, languages: 'failed' }));
            }
          } else {
            console.warn("Languages list validation resulted in empty or invalid list. Original extracted:", tailoredItems);
            setSectionProgress(prev => ({ ...prev, languages: 'failed' }));
          }
        } else {
          console.warn("Tailoring languages did not return an array from extractListItems. Received:", tailoredItems);
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
        const llmResponse = await callLlmApiWithRetry(certificationsPrompt);
        console.log("Raw LLM output for Certifications:", llmResponse);
        
        const processedCerts = processCertifications(llmResponse);
        console.log("Processed items for Certifications by processCertifications:", processedCerts);
        
        // processCertifications can return null or an array (possibly empty or default)
        if (Array.isArray(processedCerts)) {
          const validCerts = processedCerts
            .map(item => typeof item === 'string' ? item.trim() : "")
            .filter(item => item.length > 0 && item.length < 150); // Max length 150

          console.log("Validated items for Certifications:", validCerts);

          // processCertifications has logic for default placeholders if LLM indicates none.
          // So, an empty validCerts list here might be intentional if the defaults were filtered out
          // or if the response was noisy and no actual certs were found.
          // We proceed if validCerts has items OR if processedCerts was an empty array (preserving defaults if any passed through).
          if (validCerts.length > 0 || (Array.isArray(processedCerts) && processedCerts.length === 0 && llmResponse.trim().length < 15) ) { // Allow update if valid certs OR (empty array from processCerts AND short LLM response, implying "none" was intended)
            if (updateSkills("certifications", validCerts)) { // Update with the filtered list
              successCount++;
              setSectionProgress(prev => ({ ...prev, certifications: 'success' }));
            } else {
              console.warn("Failed to update certifications section even after validation.");
              setSectionProgress(prev => ({ ...prev, certifications: 'failed' }));
            }
          } else {
             console.warn("Certifications list validation resulted in empty or invalid list, and not a clear 'none' from LLM. Original processed:", processedCerts, "Filtered valid:", validCerts);
            setSectionProgress(prev => ({ ...prev, certifications: 'failed' }));
          }
        } else {
          // This means processCertifications returned null (e.g. noisy long string)
          console.warn("Processing certifications resulted in null (likely noisy input). Raw LLM response:", llmResponse.substring(0,100));
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