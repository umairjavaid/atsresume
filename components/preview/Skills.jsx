import React from "react";
import { sanitizeJSONString } from "../../utils/resumeUtils";

const Skills = ({ title, skills }) => {
  // Sanitize each skill in the array
  const sanitizedSkills = skills.map(skill => 
    typeof skill === 'string' ? sanitizeJSONString(skill) : skill
  );
  
  const filteredSkills = sanitizedSkills.filter(skill => skill && skill.trim() !== '');

  return (
    filteredSkills.length > 0 && (
      <>
        <h2 className="section-title mb-1 border-b-2 border-gray-300">
          {title}
        </h2>
        <p className="sub-content">{filteredSkills.join(", ")}</p>
      </>
    )
  );
};

export default Skills;