import type { CSSProperties, HTMLAttributes } from 'react'

/**
 * ImageGen-authored computer silhouette, embedded as an alpha mask so every
 * product surface keeps the same generated shape while inheriting currentColor.
 */
const COMPUTER_USE_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAGuUlEQVR4Ae1ZTWteRRSemXvfNDWNVqKbohi0iG5cmLo24KYttthqQGha6kb9BSKCKxf9DakLK7QiBKq0YCsual2oKEFwVcQWtVihFoXGtOl7P8bnOXPn5gbT9M5NXlPoDO175545cz6ec2bm3IlSsUUEIgIRgYhARCAiEBGICEQEIgIRgYjAvYeA7uiy3rl/ek9i9WShyvuM0qqEIIP/VmnDZ2mt1dpa0v2gJgU0koSGhzHOhLK06MtI9VPRKRHztEYHDbOlT35S0RZKbb88e/L4aQ5Xk1s/ggGYmpoamu/3ZtJe73BikiVFsNA39uC/fxWrZFQGHNmPw4Gab6WOl9Lk8jSiARSULUtVFOUHI+nNN2dnZ/srybkdLb3dwO3o1/vpgaHe0GHGNs+ymzDgHxinJfwIN40TYxFNiyg1m3Yj4AG9ZgQH+gTCg1KxualeRI1A3QE7JdnRxJjhNE1eW8iGv8KkY25iu99gAIwye2hsUdhrVpd7VDJ0sXdrsU7eJEnF5KKfi6WLeB+BLUWRaz9G0xbwfzh3PKQXeVaPF0LnrAXl5wtgnIgOZZEur6XaDqRPaZOMYXntBe2Y0Fv+BAOAFb6FaYeY/XHm5IlvW+oZJNvVXfumf0d2jenSjoYqqiPXdiJSX5DHdmYmJl7vtZ03KD7agHAYiYnRfsG0VhcMgEiGGll+E631DJZR7An2XWzqAABW2tKCHKxjIdIlBUImON4OAPDUZwPic07Ihv4iCxESmPQ/ZYAHmmWIumuWgEvKRunROibBGeCVdIa8tWktGass7BZ/V7221OTYmAGsA+5UwQUJXQPzBLIQRwCrKFWiIgxtnTKgygK3FYRqXGd+vw0RA7P8Y6KVpmAA3FcME+4u2QRhSZfIe3SCAdAapwDXAYvw0W1dl57Xv07P7mYEA+A3QZ6F8/NXNn4ZYA0gIPxgXvYN1RbZYAAoWBZAd9Db2taOD5sgslLOQWyD7eY0uIIB8CH3z4asDe0y/lyeoS14Ro0yc+4uKYR4MYAW6rvwBwMgpQN0ddbYycxVJmEPcK4zJ8PzMhgAHgC1Hn8Ir2LfwIe4B4gSwhCeBcEAUJfHYG7uaCa6N/Bn7ujRzLvtnyHmBN8IUbisN63GcRNzKLHmQlNhbgremcjGnJYJLmmszsHQVGR0Yfu21Kny9ymZKrSxiU20MGJCrjI1pIcaPlHKUsux8YueUj+Ni+VxMnY5CJt2LUlfpUdFbsPRW3AZ+WFZFvRWZpBuLAoluepGpWTAjX8pfrBnSqZyrypVYlOdiBxHTRXvl0UMWCGCHIBIvjnBhzHw+ybvqPvpsEmre3USOyyBYADgBTXBqBK1d6rSlDdSNFAe7NbNAVW/NjpkdtcqnEWBzdkc4aHWmLBi18uvS2Fk24qMqxCDAYAsUYLUvmyL7D0YUeIjpFYMwwWgpk6sCCQDjGOisFbBE05qzRCjX5QFAWQ1Z1RRzUTAKasA/1Lsq7lMOvCXWGAQhnWj3sX7o9XMoEcwAHA4hzJ+gi5+9snx94O0DYh510vTb9EmoOnha60pGAB4/g2U7ULUn9i97+BpZMJPiD+CwCTwwZfPcxCwThEpscZXqcwCaU3+iiTZQTobcqSKNHTKe7PSlbTHNoIsehIJ+DhngO1rPkNaMACwaSbLs1ew9p9JEvXiMr+hmd4yGty5pF9Z46Hhn7F8Ez6+kJebGJKZf1kkntxjLKwjj5fn51GWk8MxR+1n/R/7RTHjedo+Pdxt+YVv795XtxVp721YO4kwDfNWkmsa5tZ+0iEKh0OSDvxjKXo49/RjGMCW4FQ6rNwL3MGitr+CJxdA4CecJx7oOX4h8ZX4ymWoXsTWcb6f9498cerjK56r7ZOiO7fJyclUjY9LFt1aWNCbRkZqM1cSuumv/JEk0XPw6X442OCFL2igzMP5HTceML/9Z/4voIwvpz4MnZcuPZivpSBbEwDLzbnz2wv7Do0NK/UzIrp1OQBwG3EGANdturj9zOzsn3eWtj4cAwdg98sHd+hCP8UjC4fhQyj4jsDdzUxiSYEqDxwA9iao74B0rYelk6nywtmTJ75fH1dXljJQAHbuP/Bcosx5/PV3s894VI6yfuEwGn+4AbLvkDA81kE2KAnyIl9EjfD8559+9B05BtGCT4EQI4zVW5M03cx9zDdWj2g1qUoAPyyQ+Jc0SYex22/174N4DhSAG39vPzcydvENo5NnfbkqFyrw2mPiok/XWAlKjcj9XSDCmfLD1csj5wbheJQZEYgIRAQiAhGBiEBEICIQEYgIRAQiAvcyAv8Ct4V63wh83acAAAAASUVORK5CYII='

export interface ComputerUseIconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Square edge in px. */
  size?: number | undefined
}

/** Shared Computer Use glyph for settings navigation and browser controls. */
export function ComputerUseIcon({ size = 16, style, ...props }: ComputerUseIconProps) {
  const maskStyle: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    flex: 'none',
    backgroundColor: 'currentColor',
    WebkitMaskImage: `url(${COMPUTER_USE_ICON})`,
    maskImage: `url(${COMPUTER_USE_ICON})`,
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    // The generated 64px asset has generous transparent padding. Scale the
    // mask inside the requested box so the visible monitor carries the same
    // optical weight as the adjacent 16px product glyphs without changing the
    // layout slot or shifting labels that follow it.
    WebkitMaskSize: '160%',
    maskSize: '160%',
    ...style,
  }
  return <span {...props} data-computer-use-icon="true" aria-hidden="true" style={maskStyle} />
}
