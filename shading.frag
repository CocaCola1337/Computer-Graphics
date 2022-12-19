#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform vec3 material_emission;

uniform int has_color_texture;
layout(binding = 0) uniform sampler2D colorMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;


vec2 sphericalCoords(vec3 dir) {
    float theta = acos(max(-1.0f, min(1.0f, dir.y)));
    float phi = atan(dir.z, dir.x);
    if(phi < 0.0f)
    {
        phi = phi + 2.0f * PI;
    }
    return vec2(phi / (2.0 * PI),  1 - theta / PI);
}

vec3 calculateDirectIllumiunation(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 direct_illum = base_color;
	///////////////////////////////////////////////////////////////////////////
	// Task 1.2 - Calculate the radiance Li from the light, and the direction
	//            to the light. If the light is backfacing the triangle,
	//            return vec3(0);
	///////////////////////////////////////////////////////////////////////////

	vec3 wi = normalize(viewSpaceLightPosition - viewSpacePosition);
    float d = length(viewSpaceLightPosition - viewSpacePosition);
    vec3 Li = point_light_intensity_multiplier * point_light_color / (d * d);

    if (dot(n, wi) <= 0) {
        return vec3(0);
    }

	///////////////////////////////////////////////////////////////////////////
	// Task 1.3 - Calculate the diffuse term and return that as the result
	///////////////////////////////////////////////////////////////////////////
	vec3 diffuse_term = base_color * 1.0 / PI * abs(dot(n, wi)) * Li;

	///////////////////////////////////////////////////////////////////////////
	// Task 2 - Calculate the Torrance Sparrow BRDF and return the light
	//          reflected from that instead
	///////////////////////////////////////////////////////////////////////////
	vec3 wh = normalize(wi + wo);
    float F = material_fresnel + (1 - material_fresnel) * pow(1 - dot(wh, wi), 5);
    float D = (material_shininess + 2) / (2 * PI) * pow(abs(dot(n, wh)), material_shininess);
    float G = min(1, min(
    2*dot(n, wh)*dot(n, wo) / dot(wo, wh),
    2*dot(n, wh)*dot(n, wi) / dot(wo, wh)
    ));
    float brdf = F * D * G / (4 * dot(n, wo) * dot(n, wi));


	///////////////////////////////////////////////////////////////////////////
	// Task 3 - Make your shader respect the parameters of our material model.
	///////////////////////////////////////////////////////////////////////////

	vec3 dielectric_term = brdf * dot(n, wi) * Li + (1 - F) * diffuse_term;
    vec3 metal_term = brdf * base_color * dot(n, wi)*Li;

	direct_illum = material_metalness * metal_term + (1 - material_metalness) * dielectric_term;

	return direct_illum;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n, vec3 base_color)
{
	///////////////////////////////////////////////////////////////////////////
	// Task 5 - Lookup the irradiance from the irradiance map and calculate
	//          the diffuse reflection
	///////////////////////////////////////////////////////////////////////////
	
	vec3 N = mat3(viewInverse) * n;
    vec2 lookup = sphericalCoords(N);
    vec4 irradiance = environment_multiplier * texture(irradianceMap, lookup);
    vec3 diffuse_term = material_color * (1 / PI) * irradiance.rgb;


	///////////////////////////////////////////////////////////////////////////
	// Task 6 - Look up in the reflection map from the perfect specular
	//          direction and calculate the dielectric and metal terms.
	///////////////////////////////////////////////////////////////////////////

	vec3 wo_w = mat3(viewInverse) * wo;
    vec3 wi = normalize(reflect(-wo_w, N));
    float roughness = sqrt(sqrt(2.f/(material_shininess+2.f)));
    lookup = sphericalCoords(wi);
    vec3 Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).rgb;

    vec3 wh = normalize(wi + wo);
    float F = material_fresnel + (1 - material_fresnel) * pow(1 - dot(wh, wi), 5);
    vec3 dielectric_term = F * Li + (1 - F) * diffuse_term;
    vec3 metal_term = F * base_color * Li;
    
	vec3 indirect_illum = material_metalness * metal_term + (1 - material_metalness) * dielectric_term;
   

	return indirect_illum;
}


void main()
{
	///////////////////////////////////////////////////////////////////////////
	// Task 1.1 - Fill in the outgoing direction, wo, and the normal, n. Both
	//            shall be normalized vectors in view-space.
	///////////////////////////////////////////////////////////////////////////
	vec3 n = normalize(viewSpaceNormal);
    vec3 wo = normalize(-viewSpacePosition);

	vec3 base_color = material_color;
	if(has_color_texture == 1)
	{
		base_color *= texture(colorMap, texCoord).rgb;
	}

	vec3 direct_illumination_term = vec3(0.0);
	{ // Direct illumination
		direct_illumination_term = calculateDirectIllumiunation(wo, n, base_color);
	}

	vec3 indirect_illumination_term = vec3(0.0);
	{ // Indirect illumination
		indirect_illumination_term = calculateIndirectIllumination(wo, n, base_color);
	}

	///////////////////////////////////////////////////////////////////////////
	// Task 1.4 - Make glowy things glow!
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = vec3(0.0);

	vec3 final_color = direct_illumination_term + indirect_illumination_term + emission_term;

	// Check if we got invalid results in the operations
	if(any(isnan(final_color)))
	{
		final_color.rgb = vec3(1.f, 0.f, 1.f);
	}

	fragmentColor.rgb = final_color;
}

